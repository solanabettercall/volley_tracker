import {
  OnQueueActive,
  OnQueueCompleted,
  OnQueueFailed,
  Process,
  Processor,
} from '@nestjs/bull';
import { Job } from 'bull';
import { TelegramService } from '../telegram/telegram.service';
import {
  LineupEvent,
  SubstitutionEvent,
} from '../monitoring/monitoring.processor';
import { NOTIFY_QUEUE } from './notify.const';
import { PlayerInfo } from 'src/providers/dataproject/interfaces/player-info.interface';
import { Logger } from '@nestjs/common';
import * as moment from 'moment';
import Redis from 'ioredis';
import { appConfig } from 'src/config';

export type NotificationEvent = LineupEvent | SubstitutionEvent;

@Processor(NOTIFY_QUEUE)
export class NotifyProcessor {
  constructor(private readonly telegramService: TelegramService) {}

  private readonly redis = new Redis({
    host: appConfig.redis.host,
    port: appConfig.redis.port,
  });

  private formatPlayersList(players: PlayerInfo[], symbol: string): string {
    return players
      .slice()
      .sort((a, b) => {
        const ratingA =
          a.statistic?.playedSetsCount && a.statistic?.playedSetsCount > 0
            ? a.statistic.totalPoints / a.statistic.playedSetsCount
            : 0;
        const ratingB =
          b.statistic?.playedSetsCount && b.statistic?.playedSetsCount > 0
            ? b.statistic.totalPoints / b.statistic.playedSetsCount
            : 0;
        return ratingB - ratingA;
      })
      .map((p) => {
        let rating = null;
        let ratingString = '';
        let positionString = '';

        if (
          p.statistic?.playedSetsCount &&
          p.statistic?.totalPoints &&
          p.statistic?.playedSetsCount > 0
        ) {
          rating = p.statistic?.totalPoints / p.statistic?.playedSetsCount;
          ratingString = `\n Рейтинг: ${rating.toFixed(2)} *(${p.statistic.totalPoints}/${p.statistic.playedSetsCount})*`;
        }

        if (p.position) {
          positionString = ` _(${p.position})_`;
        }

        return `- ${symbol} № ${p.number}: ${p.fullName.toUpperCase()}${positionString}${ratingString}`;
      })
      .join('\n');
  }

  private formatTeamSection(
    missing: PlayerInfo[],
    inactive: PlayerInfo[],
    all: PlayerInfo[],
    teamName: string,
    isHome: boolean,
  ): string {
    const parts: string[] = [];
    // `🔴 *${home.team.name.toUpperCase()}:*`,
    parts.push(`\n${isHome ? '🔴' : '🔵'} *${teamName.toUpperCase()}:*`);
    if (missing.length)
      parts.push(`❌ *Не заявлены:*\n${this.formatPlayersList(missing, '⚪️')}`);
    if (inactive.length)
      parts.push(
        `🪑 *На скамейке:*\n${this.formatPlayersList(inactive, '🔘')}`,
      );
    const active = this.formatPlayersList(
      all.filter((p) => p.isActive),
      '🟢',
    );

    if (!missing.length && !inactive.length && !active) {
      return '\n';
    }
    if (active) parts.push(`👥 *Основной состав:*\n${active}`);
    return parts.join('\n\n');
  }

  private formatMatchDateTime(date: string | Date): string {
    return moment(date).utcOffset('+03:00').format('DD.MM.YYYY HH:mm');
  }

  private formatNotification(event: NotificationEvent): string {
    const { match, federation, matchDateTimeUtc, type, home, guest } = event;

    const competition =
      match.competition.name ||
      match.competition.fullName ||
      'Неизвестный турнир';
    const titleEmoji = type === 'lineup' ? '📋' : '🔄';
    const titleText = type === 'lineup' ? 'ИЗМЕНЕНИЕ СОСТАВА' : 'ЗАМЕНА';
    const matchLink = `https://${federation.slug}-web.dataproject.com/LiveScore_adv.aspx?ID=${match.id}`;

    const header = [
      `${titleEmoji} *${titleText}*`,
      federation?.emoji ? `${federation.emoji} ${federation.name}` : '',
      `🏆 ${competition}`,
      `📅 ${this.formatMatchDateTime(matchDateTimeUtc)}`,
      `\n🏐 *${home.team.name.toUpperCase()}* vs *${guest.team.name.toUpperCase()}*`,
    ]
      .filter(Boolean)
      .join('\n');

    return [
      header,
      // `🔴 *${home.team.name.toUpperCase()}:*`,
      this.formatTeamSection(
        home.missingPlayers,
        home.inactivePlayers,
        home.team.players,
        home.team.name,
        true,
      ),
      // `\n🔵 *${guest.team.name.toUpperCase()}:*`,
      this.formatTeamSection(
        guest.missingPlayers,
        guest.inactivePlayers,
        guest.team.players,
        guest.team.name,
        false,
      ),
      `🔗 [Подробнее](${matchLink})`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  @OnQueueActive()
  onActive(job: Job) {
    Logger.log(`Processing job ${job.id} of type ${job.name}`);
  }

  @OnQueueCompleted()
  onCompleted(job: Job, result: any) {
    Logger.log(
      `Completed job ${job.id} with result: ${JSON.stringify(result)}`,
    );
  }

  @OnQueueFailed()
  onFailed(job: Job, err: any) {
    Logger.error(`Failed job ${job.id} with error: ${err.message}`);
  }

  @Process('notify')
  async handleNotification(job: Job<NotificationEvent>) {
    try {
      const event = job.data;

      // Logger.verbose(job.id);
      Logger.verbose(event, job.id);

      const message = this.formatNotification(event);

      const key = `notify:${job.id}`;
      const chatId = appConfig.tg.channelId || event.userId;
      await this.telegramService.sendMessage(chatId, message);
      await this.redis.set(key, job.id);

      return {};
    } catch (error) {
      Logger.error('Error processing notification:', error);
      throw error;
    }
  }
}
