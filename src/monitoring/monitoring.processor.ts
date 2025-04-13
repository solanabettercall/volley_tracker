import { Processor, Process, InjectQueue } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { DataprojectApiService } from '../providers/dataproject/dataproject-api.service';
import { Logger } from '@nestjs/common';
import { CountryInfo, CountrySlug } from '../providers/dataproject/types';
import { MONITOR_QUEUE } from '../providers/dataproject/monitor.consts';
import { MonitoringService } from './monitoring.service';
import { NOTIFY_QUEUE } from 'src/notifications/notify.const';
import { TeamInfo } from 'src/providers/dataproject/interfaces/team-info.interface';
import { MatchInfo } from 'src/providers/dataproject/interfaces/match-info.interface';
import { PlayerInfo } from 'src/providers/dataproject/interfaces/player-info.interface';
import { createHash, randomUUID } from 'crypto';
import * as moment from 'moment';
import { NotificationEvent } from 'src/notifications/notify.processor';

export interface LineupEvent {
  type: 'lineup';
  userId: number;
  team: TeamInfo;
  missingPlayers: PlayerInfo[]; // игроки не заявлены вообще
  inactivePlayers: PlayerInfo[]; // игроки заявлены, но не вышли на поле
  match: MatchInfo;
  country: CountryInfo;
  matchDateTimeUtc: Date;
}

export interface SubstitutionEvent {
  type: 'substitution';
  userId: number;
  team: TeamInfo;
  missingPlayers: PlayerInfo[]; // игроки не заявлены
  inactivePlayers: PlayerInfo[]; // игроки на скамейке
  match: MatchInfo;
  country: CountryInfo;
  matchDateTimeUtc: Date;
}

@Processor(MONITOR_QUEUE)
export class MonitoringProcessor {
  constructor(
    private readonly dataprojectApiService: DataprojectApiService,
    private readonly monitoringService: MonitoringService,
    @InjectQueue(NOTIFY_QUEUE)
    private readonly notifyQueue: Queue,
  ) {}

  private hashEvent(event: NotificationEvent) {
    const eventStr = JSON.stringify(event);

    return createHash('sha256').update(eventStr).digest('hex').substring(0, 16); // Можно обрезать до нужной длины
  }

  @Process('monitor-country')
  async handleCountry(job: Job<{ country: CountryInfo }>) {
    const { slug, name } = job.data.country;

    try {
      const client = this.dataprojectApiService.getClient(slug);
      const matches = await client.getMatchesInfo();

      const now = moment.utc();
      const oneHourLater = moment.utc().add(4, 'hour');

      const upcomingMatches = matches.filter(
        (match) =>
          match.matchDateTimeUtc &&
          // moment.utc(match.matchDateTimeUtc).isAfter(now) &&
          moment.utc(match.matchDateTimeUtc).isSameOrBefore(oneHourLater),
      );
      // const upcomingMatches = matches;

      if (upcomingMatches.length > 0) {
        Logger.debug(
          `${name}: Матчей в течение часа: ${upcomingMatches.length}`,
        );
      }

      const monitoredTeams =
        await this.monitoringService.getAllMonitoredTeams(slug);

      for (const team of monitoredTeams) {
        for (const match of upcomingMatches) {
          const teamSide =
            match.home.id === team.teamId
              ? match.home
              : match.guest.id === team.teamId
                ? match.guest
                : null;
          if (!teamSide) continue;

          const monitoredPlayerIds = new Set(team.players);

          const playersInMatch = teamSide.players; // Игроки, заявленные на матч
          const teamPlayers = await client.getTeamRoster(teamSide.id); // Игроки, заявленные на сезон

          const playersInMatchMap = new Map(
            playersInMatch.map((p) => [p.id, p]),
          );
          const teamPlayersMap = new Map(teamPlayers.map((p) => [p.id, p]));

          const missingPlayers: PlayerInfo[] = [];
          const inactivePlayers: PlayerInfo[] = [];

          for (const id of monitoredPlayerIds) {
            const playerInMatch = playersInMatchMap.get(id);
            const playerInTeam = teamPlayersMap.get(id);

            if (!playerInMatch && playerInTeam) {
              missingPlayers.push(playerInTeam);
            } else if (playerInMatch?.isActive === false) {
              inactivePlayers.push(playerInMatch);
            }
          }

          if (missingPlayers.length > 0) {
            const event: LineupEvent = {
              type: 'lineup',
              userId: team.userId,
              team: teamSide,
              missingPlayers,
              inactivePlayers,
              match,
              country: job.data.country,
              matchDateTimeUtc: match.matchDateTimeUtc,
            };

            const eventHash = this.hashEvent(event);

            await this.notifyQueue.add('notify', event, {
              jobId: `${eventHash}${randomUUID()}`,
            });
          }

          if (inactivePlayers.length > 0) {
            const event: SubstitutionEvent = {
              type: 'substitution',
              userId: team.userId,
              team: teamSide,
              missingPlayers,
              inactivePlayers,
              match,
              country: job.data.country,
              matchDateTimeUtc: match.matchDateTimeUtc,
            };

            const eventHash = this.hashEvent(event);

            await this.notifyQueue.add('notify', event, {
              jobId: `${eventHash}${randomUUID()}`,
            });
          }
        }
      }
    } catch (err) {
      Logger.error(`Ошибка при обработке ${slug}: ${err.message}`);
    }
  }
}
