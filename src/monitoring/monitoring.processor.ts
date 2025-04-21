import { Processor, Process, InjectQueue } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { DataprojectApiService } from '../providers/dataproject/dataproject-api.service';
import { Logger } from '@nestjs/common';
import { FederationInfo } from '../providers/dataproject/types';
import { MONITOR_QUEUE } from '../providers/dataproject/monitor.consts';
import { MonitoringService } from './monitoring.service';
import { NOTIFY_QUEUE } from 'src/notifications/notify.const';
import { TeamInfo } from 'src/providers/dataproject/interfaces/team-info.interface';
import { MatchInfo } from 'src/providers/dataproject/interfaces/match-info.interface';
import { PlayerInfo } from 'src/providers/dataproject/interfaces/player-info.interface';
import { createHash } from 'crypto';
import * as moment from 'moment';
import * as stringify from 'json-stable-stringify';
import { appConfig } from 'src/config';
import Redis from 'ioredis';

interface TeamEventData {
  team: TeamInfo;
  missingPlayers: PlayerInfo[];
  inactivePlayers: PlayerInfo[];
}

export interface LineupEvent {
  type: 'lineup';
  userId: number;
  home: TeamEventData;
  guest: TeamEventData;
  match: MatchInfo;
  federation: FederationInfo;
  matchDateTimeUtc: Date;
}

export interface SubstitutionEvent {
  type: 'substitution';
  userId: number;
  home: TeamEventData;
  guest: TeamEventData;
  match: MatchInfo;
  federation: FederationInfo;
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

  private readonly redis = new Redis({
    host: appConfig.redis.host,
    port: appConfig.redis.port,
  });

  private hashEvent(event: LineupEvent | SubstitutionEvent): string {
    // const normalizePlayers = (players: PlayerInfo[]) =>
    //   players.map((p) => p.id).sort((a, b) => a - b);

    const normalized = {
      // home: {
      //   missingPlayerIds: normalizePlayers(event.home.missingPlayers),
      //   inactivePlayerIds: normalizePlayers(event.home.inactivePlayers),
      //   teamId: event.home.team.id,
      // },
      // guest: {
      //   missingPlayerIds: normalizePlayers(event.guest.missingPlayers),
      //   inactivePlayerIds: normalizePlayers(event.guest.inactivePlayers),
      //   teamId: event.guest.team.id,
      // },
      matchId: event.match.id,
      federationSlug: event.federation.slug,
      userId: event.userId,
      eventType: event.type,
    };

    const eventStr = stringify(normalized);

    const hash = createHash('md5').update(eventStr).digest('hex');

    return hash;
  }

  @Process('monitor-federation')
  async handleFederation(job: Job<{ federation: FederationInfo }>) {
    const { federation } = job.data;

    try {
      const client = this.dataprojectApiService.getClient(federation);
      const matches = await client.getMatchesInfo();

      const oneHourBefore = moment.utc().subtract(1, 'hour');
      const oneHourLater = moment.utc().add(2, 'hour');

      const upcomingMatches = matches.filter(
        (match) =>
          match.matchDateTimeUtc &&
          moment.utc(match.matchDateTimeUtc).isAfter(oneHourBefore) &&
          moment.utc(match.matchDateTimeUtc).isSameOrBefore(oneHourLater),
      );

      if (upcomingMatches.length > 0) {
        Logger.debug(
          `${federation.name}: Матчей в течение часа: ${upcomingMatches.length}`,
        );
      }

      const monitoredTeams =
        await this.monitoringService.getAllMonitoredTeams(federation);

      for (const match of upcomingMatches) {
        const homeTeamId = match.home.id;
        const guestTeamId = match.guest.id;

        for (const player of match.home.players) {
          player.statistic = await this.dataprojectApiService
            .getClient(federation)
            .getPlayerStatistic(player.id, match.home.id, match.competition.id);
        }

        for (const player of match.guest.players) {
          player.statistic = await this.dataprojectApiService
            .getClient(federation)
            .getPlayerStatistic(player.id, match.home.id, match.competition.id);
        }

        const usersMonitoringMatch = new Set<number>();
        const homeTeamMonitors = monitoredTeams.filter(
          (t) => t.teamId === homeTeamId,
        );
        const guestTeamMonitors = monitoredTeams.filter(
          (t) => t.teamId === guestTeamId,
        );

        homeTeamMonitors.forEach((t) => usersMonitoringMatch.add(t.userId));
        guestTeamMonitors.forEach((t) => usersMonitoringMatch.add(t.userId));

        if (usersMonitoringMatch.size === 0) continue;

        const [homeTeamPlayers, guestTeamPlayers] = await Promise.all([
          client.getTeamRoster(homeTeamId, match.competition?.id),
          client.getTeamRoster(guestTeamId, match.competition?.id),
        ]);

        for (const player of homeTeamPlayers) {
          player.statistic = await this.dataprojectApiService
            .getClient(federation)
            .getPlayerStatistic(player.id, match.home.id, match.competition.id);
        }

        for (const player of guestTeamPlayers) {
          player.statistic = await this.dataprojectApiService
            .getClient(federation)
            .getPlayerStatistic(
              player.id,
              match.guest.id,
              match.competition.id,
            );
        }

        const homeTeamData = {
          team: match.home,
          playersInMatch: match.home.players,
          teamPlayers: homeTeamPlayers,
        };

        const guestTeamData = {
          team: match.guest,
          playersInMatch: match.guest.players,
          teamPlayers: guestTeamPlayers,
        };

        for (const userId of usersMonitoringMatch) {
          const homeResult = this.processTeamForUser(
            homeTeamData,
            monitoredTeams.filter(
              (t) => t.userId === userId && t.teamId === homeTeamId,
            ),
          );

          const guestResult = this.processTeamForUser(
            guestTeamData,
            monitoredTeams.filter(
              (t) => t.userId === userId && t.teamId === guestTeamId,
            ),
          );

          const commonEventFields = {
            userId,
            match,
            federation,
            matchDateTimeUtc: match.matchDateTimeUtc,
            home: {
              team: match.home,
              ...homeResult,
            },
            guest: {
              team: match.guest,
              ...guestResult,
            },
          };

          if (
            homeResult.missingPlayers.length > 0 ||
            guestResult.missingPlayers.length > 0
          ) {
            const lineupEvent: LineupEvent = {
              type: 'lineup',
              ...commonEventFields,
            };
            const lineupHash = this.hashEvent(lineupEvent);

            const key = `notify:${lineupHash}`;
            const notifyExist = await this.redis.get(key);
            if (!notifyExist) {
              await this.notifyQueue.add('notify', lineupEvent, {
                jobId: lineupHash,
                removeOnComplete: false,
                removeOnFail: true,
              });
            }
          }

          if (
            homeResult.inactivePlayers.length > 0 ||
            guestResult.inactivePlayers.length > 0
          ) {
            const substitutionEvent: SubstitutionEvent = {
              type: 'substitution',
              ...commonEventFields,
            };
            const substitutionHash = this.hashEvent(substitutionEvent);
            const key = `notify:${substitutionHash}`;

            const notifyExist = await this.redis.get(key);
            if (!notifyExist) {
              await this.notifyQueue.add('notify', substitutionEvent, {
                jobId: substitutionHash,
                removeOnComplete: false,
                removeOnFail: true,
              });
            }
          }
        }
      }
    } catch (err) {
      Logger.error(`Ошибка при обработке ${federation.slug}: ${err.message}`);
    }
  }

  private processTeamForUser(
    teamData: {
      team: TeamInfo;
      playersInMatch: PlayerInfo[];
      teamPlayers: PlayerInfo[];
    },
    userTeams: { players: number[] }[],
  ): { missingPlayers: PlayerInfo[]; inactivePlayers: PlayerInfo[] } {
    if (userTeams.length === 0) {
      return { missingPlayers: [], inactivePlayers: [] };
    }
    const playersInMatchMap = new Map(
      teamData.playersInMatch.map((p) => [p.id, p]),
    );
    const teamPlayersMap = new Map(teamData.teamPlayers.map((p) => [p.id, p]));

    const monitoredPlayerIds = new Set(userTeams.flatMap((t) => t.players));

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

    return { missingPlayers, inactivePlayers };
  }
}
