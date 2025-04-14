import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { TelegramService } from '../telegram/telegram.service';
import {
  LineupEvent,
  SubstitutionEvent,
} from '../monitoring/monitoring.processor';
import { NOTIFY_QUEUE } from './notify.const';
import { PlayerInfo } from 'src/providers/dataproject/interfaces/player-info.interface';
import { TeamInfo } from 'src/providers/dataproject/interfaces/team-info.interface';
import { FederationInfo } from 'src/providers/dataproject/types';
import { Logger } from '@nestjs/common';
import * as moment from 'moment';

export type NotificationEvent = LineupEvent | SubstitutionEvent;

@Processor(NOTIFY_QUEUE)
export class NotifyProcessor {
  constructor(private readonly telegramService: TelegramService) {}

  private formatPlayersList(players: PlayerInfo[]): string {
    if (!players?.length) return '';
    return players
      .map((p) => `⚪️ *№ ${p.number}* ${p.fullName.toUpperCase()}`)
      .join('\n');
  }

  private formatActivePlayers(teamName: string, players: PlayerInfo[]): string {
    const activePlayers = players.filter((p) => p.isActive);
    if (!activePlayers.length) return '';

    return (
      `👥 *${teamName}:*\n` +
      activePlayers.map((p) => `🟢 *№ ${p.number}* ${p.fullName}`).join('\n')
    );
  }

  private formatMatchDateTime(date: string | Date): string {
    return moment(date)
      .utcOffset('+03:00') // MSK (UTC+3)
      .format('DD.MM.YYYY HH:mm');
  }

  private formatNotification(event: NotificationEvent): string {
    const { match, federation } = event;
    const { home, guest, competition } = match;

    const dateStr = this.formatMatchDateTime(event.matchDateTimeUtc);
    const teamEmoji = event.type === 'lineup' ? '📋' : '🔄';
    const title = event.type === 'lineup' ? 'ИЗМЕНЕНИЕ СОСТАВА' : 'ЗАМЕНА';

    const matchLink = `https://${federation.slug}-web.dataproject.com/LiveScore_adv.aspx?ID=${match.id}`;

    // Формируем заголовочный блок с одинарными переносами
    const headerLines = [
      `${teamEmoji} *${title}*`,
      federation ? `${federation.emoji} ${federation.name}` : '',
      `🏆 ${competition || 'Неизвестный турнир'}`,
      `📅 ${dateStr}`,
    ]
      .filter((line) => line.length > 0)
      .join('\n');

    // Формируем остальные блоки с двойными переносами
    const bodyLines = [
      `🏐 *${home.name.toUpperCase()}* vs *${guest.name.toUpperCase()}*`,
      event.missingPlayers?.length
        ? `❌ *Не заявлены:*\n${this.formatPlayersList(event.missingPlayers)}`
        : '',
      event.inactivePlayers?.length
        ? `🪑 *На скамейке:*\n${this.formatPlayersList(event.inactivePlayers)}`
        : '',
      this.formatActivePlayers(home.name, home.players),
      this.formatActivePlayers(guest.name, guest.players),
      `🔗 [Подробнее](${matchLink})`,
    ]
      .filter((line) => line.length > 0)
      .join('\n\n');

    // Объединяем заголовок и тело
    return `${headerLines}\n\n${bodyLines}`;
  }

  @Process('notify')
  async handleNotification(job: Job<NotificationEvent>) {
    try {
      const event = job.data;
      const message = this.formatNotification(event);
      await this.telegramService.sendMessage(event.userId, message);
    } catch (error) {
      Logger.error('Error processing notification:', error);
      throw error;
    }
  }
}
