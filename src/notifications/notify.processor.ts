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
import { CountryInfo } from 'src/providers/dataproject/types';
import { Logger } from '@nestjs/common';

export type NotificationEvent = LineupEvent | SubstitutionEvent;

@Processor(NOTIFY_QUEUE)
export class NotifyProcessor {
  constructor(private readonly telegramService: TelegramService) {}

  private formatPlayersList(players: PlayerInfo[]): string {
    if (!players?.length) return '–';

    return players
      .map((p) => `- ⚪️ № ${p.number} ${p.fullName.toUpperCase()}`)
      .join('\n');
  }

  private formatActivePlayers(teamName: string, players: PlayerInfo[]): string {
    const activePlayers = players.filter((p) => p.isActive);
    if (!activePlayers.length) return `👥 *На поле (${teamName}):*\n–\n`;

    const formatted = activePlayers
      .map((p) => `- 🟢 № ${p.number} ${p.fullName}`)
      .join('\n');
    return `👥 *На поле (${teamName}):*\n${formatted}\n`;
  }

  private formatMatchDateTime(date: Date): string {
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Moscow',
    });
  }

  private formatNotification(event: NotificationEvent): string {
    const { match, country } = event;
    const { home, guest, competition } = match;

    const dateStr = this.formatMatchDateTime(event.matchDateTimeUtc);
    const teamEmoji = event.type === 'lineup' ? '📋' : '🔄';
    const title = event.type === 'lineup' ? 'ИЗМЕНЕНИЕ СОСТАВА' : 'ЗАМЕНА';

    const countryLine = country ? `${country.emoji} ${country.name}` : '';
    const matchLink = `https://${country.slug}-web.dataproject.com/LiveScore_adv.aspx?ID=${match.id}`;

    return [
      `${teamEmoji} *${title}:*`,
      `🏆 ${competition || 'Неизвестный турнир'}`,
      ...(countryLine ? [`🌍 ${countryLine}`] : []),
      `📅 ${dateStr}`,
      `🏐 [${home.name.toUpperCase()}](${this.getTeamLink(home, country)}) vs [${guest.name.toUpperCase()}](${this.getTeamLink(guest, country)})`,
      '---',
      `❌ *Не заявлены на матч:*\n${this.formatPlayersList(event.missingPlayers)}`,
      `🪑 *На скамейке:*\n${this.formatPlayersList(event.inactivePlayers)}`,
      '---',
      this.formatActivePlayers(home.name, home.players),
      this.formatActivePlayers(guest.name, guest.players),
      '---',
      `🔗 [Подробнее](${matchLink})`,
    ].join('\n\n');
  }

  private getTeamLink(team: TeamInfo, country: CountryInfo): string {
    return `https://${country.slug}-web.dataproject.com/CompetitionTeamDetails.aspx?TeamID=${team.id}`;
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
