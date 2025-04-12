import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { DataprojectApiService } from '../providers/dataproject/dataproject-api.service';
import { Logger } from '@nestjs/common';
import { CountryInfo, CountrySlug } from '../providers/dataproject/types';
import { MONITOR_QUEUE } from '../providers/dataproject/monitor.consts';
import { MonitoringService } from './monitoring.service';

export interface LineupEvent {
  type: 'lineup';
  userId: number;
  teamId: number;
  playerIds: number[]; // отсутствующие игроки
  matchId: number;
  matchDateTimeUtc: Date;
}

export interface SubstitutionEvent {
  type: 'substitution';
  userId: number;
  teamId: number;
  playerIds: number[]; // заменённые игроки
  matchId: number;
  matchDateTimeUtc: Date;
}

@Processor(MONITOR_QUEUE)
export class MonitoringProcessor {
  constructor(
    private readonly dataprojectApiService: DataprojectApiService,
    private readonly monitoringService: MonitoringService,
  ) {}

  @Process('monitor-country')
  async handleCountry(job: Job<{ country: CountryInfo }>) {
    const { slug, name } = job.data.country;

    try {
      const client = this.dataprojectApiService.getClient(slug);
      const matches = await client.getMatchesInfo();

      const now = new Date();
      const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

      // const upcomingMatches = matches.filter(
      //   (match) =>
      //     match.matchDateTimeUtc &&
      //     match.matchDateTimeUtc > now &&
      //     match.matchDateTimeUtc <= oneHourLater,
      // );
      const upcomingMatches = matches;

      Logger.debug(`${name}: Матчей в течение часа: ${upcomingMatches.length}`);

      const monitoredTeams =
        await this.monitoringService.getAllMonitoredTeams(slug);

      for (const team of monitoredTeams) {
        const monitoredPlayerIds = new Set(team.players);

        for (const match of upcomingMatches) {
          const teamSide =
            match.home.id === team.teamId
              ? match.home
              : match.guest.id === team.teamId
                ? match.guest
                : null;

          if (!teamSide) continue; // Команда не участвует в матче

          const playersInMatch = teamSide.players;
          const presentPlayerIds = new Set(playersInMatch.map((p) => p.id));

          // --- Событие: Состав ---
          const missingPlayers = [...monitoredPlayerIds].filter(
            (id) => !presentPlayerIds.has(id),
          );

          if (missingPlayers.length > 0) {
            const event: LineupEvent = {
              type: 'lineup',
              userId: team.userId,
              teamId: team.teamId,
              playerIds: missingPlayers,
              matchId: match.id,
              matchDateTimeUtc: match.matchDateTimeUtc,
            };
            console.log('Событие: Состав', event);
            // Здесь можешь отправить event в очередь или телегу
          }

          // --- Событие: Замена ---
          const substitutedPlayers = playersInMatch
            .filter((p) => monitoredPlayerIds.has(p.id) && p.isActive === false)
            .map((p) => p.id);

          if (substitutedPlayers.length > 0) {
            const event: SubstitutionEvent = {
              type: 'substitution',
              userId: team.userId,
              teamId: team.teamId,
              playerIds: substitutedPlayers,
              matchId: match.id,
              matchDateTimeUtc: match.matchDateTimeUtc,
            };
            console.log('Событие: Замена', event);
            // Здесь можешь отправить event в очередь или телегу
          }
        }
      }
    } catch (err) {
      Logger.error(`Ошибка при обработке ${slug}: ${err.message}`);
    }
  }
}
