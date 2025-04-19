import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as TelegramBot from 'node-telegram-bot-api';
import { appConfig } from 'src/config';
import { DataprojectApiService } from 'src/providers/dataproject/dataproject-api.service';
import { federations, FederationSlug } from 'src/providers/dataproject/types';

import { MonitoredTeam } from '../schemas/monitoring.schema';
import { MonitoringService } from 'src/monitoring/monitoring.service';
import { PlayerInfo } from 'src/providers/dataproject/interfaces/player-info.interface';
import { TeamInfo } from 'src/providers/dataproject/interfaces/team-info.interface';
import Redis from 'ioredis';
import * as stringify from 'json-stable-stringify';
import { createHash } from 'crypto';

interface ICallbackContext {
  event: string;
  chatId: number;
  federationSlug?: FederationSlug;
  competition?: string;
  teamId?: number;
  playerId?: number;
  messageId?: number;
}

@Injectable()
export class TelegramService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TelegramService.name);
  private readonly telegramBot: TelegramBot;

  constructor(
    private readonly dataprojectApiService: DataprojectApiService,
    private readonly monitoringService: MonitoringService,
  ) {
    this.telegramBot = new TelegramBot(appConfig.tg.token, { polling: true });
  }

  private async storeCallbackContext(
    context: ICallbackContext,
  ): Promise<string> {
    const contextStr = stringify(context);

    const key = createHash('md5').update(contextStr).digest('hex');
    await this.redis.set(key, JSON.stringify(context), 'EX', 3600 * 24);
    return key;
  }

  private async getCallbackContext(
    key: string,
  ): Promise<ICallbackContext | null> {
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  private readonly redis = new Redis({
    host: appConfig.redis.host,
    port: appConfig.redis.port,
  });

  async sendMessage(userId: number, message: string) {
    await this.telegramBot.sendMessage(userId, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });
  }

  async onApplicationBootstrap() {
    this.telegramBot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      this.sendMainMenu(chatId);
    });

    this.telegramBot.onText(/\/clear/, async (msg) => {
      const chatId = msg.chat.id;
      await this.monitoringService.clearMonitoring(chatId);
      await this.sendMessage(chatId, 'Мониторинг успешно очищен');
    });

    this.telegramBot.on('callback_query', async (callbackQuery) => {
      const msg = callbackQuery.message;
      const contextHash = callbackQuery.data;
      const context = await this.getCallbackContext(contextHash);
      const event: string | null = context?.event ?? null;

      if (!msg || !contextHash || !context) {
        await this.sendMainMenu(callbackQuery.from.id);
        await this.telegramBot.answerCallbackQuery(callbackQuery.id);
      }

      this.logger.verbose(context);

      switch (event) {
        case 'select_competition':
          await this.sendTeams(context);
          break;

        case 'send_monitored_federations':
          await this.sendMonitoredFederations(context);
          break;

        case 'select_federation_menu':
          await this.sendFederations(context);
          break;

        case 'send_statistic_federations':
          await this.sendStatisticFederations(context);
          break;

        case 'back_to_main':
          await this.sendMainMenu(context.chatId);
          break;

        case 'select_federation':
          await this.sendCompetitions(context);
          break;

        case 'select_team':
          await this.sendPlayers(context);
          break;

        case 'toggle_player':
          await this.togglePlayer({ messageId: msg.message_id, ...context });
          break;

        case 'stop_monitoring':
          await this.stopMonitoring(context);
          break;

        case 'back_to_countries':
          await this.sendFederations(context);
          break;
        case 'back_to_competitions':
          await this.sendCompetitions(context);
          break;

        case 'back_to_teams':
          await this.sendTeams(context);
          break;
        case 'send_monitored_competitions':
          await this.sendMonitoredCompetitions(context);
          break;

        case 'send_monitored_competition_info':
          await this.sendMonitoredCompetitionInfo(context);
          break;

        case 'send_statistic_competitions':
          await this.sendStatisticCompetitions(context);
          break;

        case 'send_statistic_teams':
          await this.sendStatisticTeams(context);
          break;

        case 'send_team_statistic':
          await this.sendTeamStatistic(context);
          break;

        default:
          await this.sendMainMenu(context.chatId);
          break;
      }

      await this.telegramBot.answerCallbackQuery(callbackQuery.id);
    });
  }

  async sendCompetitions(context: ICallbackContext) {
    const federation = federations.find(
      (f) => f.slug === context.federationSlug,
    );
    if (!federation) return;

    const client = this.dataprojectApiService.getClient(context.federationSlug);
    const teams = await client.getAllTeams();
    const competitions: string[] = Array.from(
      new Set(teams.map((t) => t.competition)),
    );

    const keyboard = [];
    for (const competition of competitions) {
      const key = await this.storeCallbackContext({
        event: 'select_competition',
        chatId: context.chatId,
        federationSlug: context.federationSlug,
        competition,
      });
      keyboard.push([
        {
          text: competition,
          callback_data: key,
        },
      ]);
    }

    keyboard.push([
      {
        text: '⬅️ Назад',
        callback_data: await this.storeCallbackContext({
          event: 'back_to_countries',
          chatId: context.chatId,
        }),
      },
    ]);

    this.telegramBot.sendMessage(
      context.chatId,
      `${federation.emoji} ${federation.name}\n\n🏆 Выберите лигу:`,
      {
        reply_markup: {
          inline_keyboard: keyboard,
        },
      },
    );
  }

  private async togglePlayer(context: ICallbackContext) {
    const monitoredTeam = await this.monitoringService.getPlayersForTeam(
      context.chatId,
      context.federationSlug,
      context.teamId,
    );
    const alreadyMonitored = monitoredTeam.includes(context.playerId);

    if (alreadyMonitored) {
      await this.monitoringService.removePlayerFromMonitoring(
        context.chatId,
        context.federationSlug,
        context.teamId,
        context.playerId,
      );
    } else {
      await this.monitoringService.addPlayerToMonitoring(
        context.chatId,
        context.federationSlug,
        context.teamId,
        context.playerId,
      );
    }

    const players = await this.dataprojectApiService
      .getClient(context.federationSlug)
      .getTeamRoster(context.teamId);

    const updatedPlayerIds = await this.monitoringService.getPlayersForTeam(
      context.chatId,
      context.federationSlug,
      context.teamId,
    );

    const keyboard = [];
    for (const player of players) {
      keyboard.push([
        {
          text: `${updatedPlayerIds.includes(player.id) ? '✅' : '❌'} #${player.number} ${player.fullName}`,
          callback_data: await this.storeCallbackContext({
            event: 'toggle_player',
            chatId: context.chatId,
            federationSlug: context.federationSlug,
            competition: context.competition,
            teamId: context.teamId,
            playerId: player.id,
            messageId: context.messageId,
          }),
        },
      ]);
    }

    if (updatedPlayerIds.length > 0) {
      keyboard.push([
        {
          text: '🚫 Прекратить мониторинг команды',
          callback_data: await this.storeCallbackContext({
            event: 'stop_monitoring',
            chatId: context.chatId,
            federationSlug: context.federationSlug,
            competition: context.competition,
            teamId: context.teamId,
          }),
        },
      ]);
    }

    keyboard.push([
      {
        text: '⬅️ Назад',
        callback_data: await this.storeCallbackContext({
          event: 'back_to_teams',
          chatId: context.chatId,
          federationSlug: context.federationSlug,
          competition: context.competition,
        }),
      },
      { text: '🏠 На главную', callback_data: 'back_to_main' },
    ]);

    await this.telegramBot.editMessageReplyMarkup(
      { inline_keyboard: keyboard },
      { chat_id: context.chatId, message_id: context.messageId },
    );
  }

  private async stopMonitoring(context: ICallbackContext) {
    const monitoredPlayers = await this.monitoringService.getPlayersForTeam(
      context.chatId,
      context.federationSlug,
      context.teamId,
    );

    for (const playerId of monitoredPlayers) {
      await this.monitoringService.removePlayerFromMonitoring(
        context.chatId,
        context.federationSlug,
        context.teamId,
        playerId,
      );
    }

    const teams = await this.dataprojectApiService
      .getClient(context.federationSlug)
      .getAllTeams();

    const team = teams.find((t) => t.id === context.teamId);

    if (team) {
      const federation = federations.find(
        (c) => c.slug === context.federationSlug,
      );
      if (federation) {
        await this.sendTeams(context);
      }
    }
  }

  private async sendMainMenu(chatId: number) {
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '🔍 Настроить мониторинг',
            callback_data: await this.storeCallbackContext({
              event: 'select_federation_menu',
              chatId,
            }),
          },
        ],
        [
          {
            text: '👁️ Текущий мониторинг',
            callback_data: await this.storeCallbackContext({
              event: 'send_monitored_federations',
              chatId,
            }),
          },
        ],
        [
          {
            text: '📊 Статистика',
            callback_data: await this.storeCallbackContext({
              event: 'send_statistic_federations',
              chatId,
            }),
          },
        ],
      ],
    };
    await this.telegramBot.sendMessage(
      chatId,
      'Добро пожаловать! Выберите действие:',
      { reply_markup: keyboard },
    );
  }

  private async sendFederations(context: ICallbackContext) {
    const keyboard = [];
    for (let i = 0; i < federations.length; i += 2) {
      const row = [];

      for (let j = 0; j < 2 && i + j < federations.length; j++) {
        const federation = federations[i + j];
        row.push({
          text: ` ${federation.emoji} ${federation.name}`,
          callback_data: await this.storeCallbackContext({
            chatId: context.chatId,
            event: 'select_federation',
            federationSlug: federation.slug,
          }),
        });
      }

      keyboard.push(row);
    }

    keyboard.push([
      {
        text: '⬅️ На главную',
        callback_data: await this.storeCallbackContext({
          event: 'back_to_main',
          chatId: context.chatId,
        }),
      },
    ]);

    await this.telegramBot.sendMessage(context.chatId, 'Выберите страну:', {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  }

  private async sendTeams(context: ICallbackContext) {
    const federation = federations.find(
      (f) => f.slug === context.federationSlug,
    );
    if (!federation) return;

    const client = this.dataprojectApiService.getClient(federation.slug);
    const teamList = await client.getAllTeams();
    const filteredTeams = teamList.filter(
      (t) => t.competition === context.competition,
    );

    const matches = await client.getMatchesInfo();
    const filteredMatches = matches.filter(
      (m) => m.competition === context.competition,
    );
    const matchTeams = filteredMatches.flatMap((m) => [m.guest, m.home]);
    const allTeams = [...filteredTeams, ...matchTeams];
    const uniqueTeamsMap = new Map<number, (typeof allTeams)[number]>();

    for (const team of allTeams) {
      uniqueTeamsMap.set(team.id, team);
    }

    const uniqueTeams = Array.from(uniqueTeamsMap.values()).sort((a, b) => {
      if (a.competition === b.competition) {
        return a.name.localeCompare(b.name);
      }
      return a.competition.localeCompare(b.competition);
    });

    const keyboard = [];

    for (const team of uniqueTeams) {
      keyboard.push([
        {
          text: `${team.name}`,
          callback_data: await this.storeCallbackContext({
            event: 'select_team',
            chatId: context.chatId,
            federationSlug: context.federationSlug,
            competition: context.competition,
            teamId: team.id,
          }),
        },
      ]);
    }
    keyboard.push([
      {
        text: '⬅️ Назад',
        callback_data: await this.storeCallbackContext({
          event: 'back_to_competitions',
          chatId: context.chatId,
          federationSlug: context.federationSlug,
        }),
      },
    ]);

    this.telegramBot.sendMessage(
      context.chatId,
      `${federation.emoji} ${federation.name}\n🏆 ${context.competition}\n\n👥 Выберите команду:`,
      {
        reply_markup: {
          inline_keyboard: keyboard,
        },
      },
    );
  }

  private async sendPlayers(context: ICallbackContext) {
    const players = await this.dataprojectApiService
      .getClient(context.federationSlug)
      .getTeamRoster(context.teamId);

    const matches = await this.dataprojectApiService
      .getClient(context.federationSlug)
      .getMatchesInfo();

    const liveTeam = matches
      .flatMap((m) => [m.home, m.guest])
      .find((t) => t.id === context.teamId);

    let allPlayers = [...players];

    if (liveTeam?.players) {
      const playersMap = new Map<number, PlayerInfo>();

      players.forEach((player) => playersMap.set(player.id, player));

      liveTeam.players.forEach((player) => {
        if (!playersMap.has(player.id)) {
          playersMap.set(player.id, player);
        }
      });
      allPlayers = Array.from(playersMap.values());
    }

    const teams = await this.dataprojectApiService
      .getClient(context.federationSlug)
      .getAllTeams();

    const team = teams.find((t) => t.id === context.teamId);
    const federation = federations.find(
      (c) => c.slug === context.federationSlug,
    );

    const monitoredPlayerIds = new Set(
      await this.monitoringService.getPlayersForTeam(
        context.chatId,
        context.federationSlug,
        context.teamId,
      ),
    );

    const keyboard = [];
    for (const player of players) {
      keyboard.push([
        {
          text: `${monitoredPlayerIds.has(player.id) ? '✅' : '❌'} #${player.number} ${player.fullName}`,
          callback_data: await this.storeCallbackContext({
            event: 'toggle_player',
            chatId: context.chatId,
            federationSlug: context.federationSlug,
            competition: context.competition,
            teamId: context.teamId,
            playerId: player.id,
          }),
        },
      ]);
    }

    if (monitoredPlayerIds.size > 0) {
      keyboard.push([
        {
          text: '🚫 Прекратить мониторинг команды',
          callback_data: await this.storeCallbackContext({
            event: 'stop_monitoring',
            chatId: context.chatId,
            federationSlug: context.federationSlug,
            competition: context.competition,
            teamId: context.teamId,
          }),
        },
      ]);
    }

    keyboard.push([
      {
        text: '⬅️ Назад',
        callback_data: await this.storeCallbackContext({
          event: 'back_to_teams',
          chatId: context.chatId,
          federationSlug: context.federationSlug,
          competition: context.competition,
        }),
      },
      {
        text: '🏠 На главную',
        callback_data: await this.storeCallbackContext({
          event: 'back_to_main',
          chatId: context.chatId,
        }),
      },
    ]);

    this.telegramBot.sendMessage(
      context.chatId,
      `${federation.emoji} ${federation.name}\n🏆 ${context.competition}\n👥 ${team.name}\n\nВыберите игроков для мониторинга:\n(❌ - не мониторится, ✅ - мониторится)`,
      {
        reply_markup: {
          inline_keyboard: keyboard,
        },
      },
    );
  }

  private async sendMonitoredFederations(context: ICallbackContext) {
    const monitoredTeams = await this.monitoringService.getMonitoredTeams(
      context.chatId,
    );

    const monitoredFederations = federations.filter((f) =>
      monitoredTeams.some((t) => t.federationSlug === f.slug),
    );

    if (!monitoredFederations || monitoredFederations.length === 0) {
      await this.telegramBot.sendMessage(
        context.chatId,
        'Сейчас у вас нет активного мониторинга игроков.',
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '🔍 Настроить мониторинг',
                  callback_data: await this.storeCallbackContext({
                    event: 'select_federation_menu',
                    chatId: context.chatId,
                  }),
                },
              ],
              [
                {
                  text: '🏠 На главную',
                  callback_data: await this.storeCallbackContext({
                    event: 'back_to_main',
                    chatId: context.chatId,
                  }),
                },
              ],
            ],
          },
        },
      );
      return;
    }

    const keyboard = [];

    for (let i = 0; i < monitoredFederations.length; i += 2) {
      const row = [];

      for (let j = 0; j < 2 && i + j < monitoredFederations.length; j++) {
        const federation = monitoredFederations[i + j];
        row.push({
          text: `${federation.emoji} ${federation.name}`,
          callback_data: await this.storeCallbackContext({
            event: 'send_monitored_competitions',
            chatId: context.chatId,
            federationSlug: federation.slug,
          }),
        });
      }

      keyboard.push(row);
    }

    keyboard.push([
      {
        text: '⬅️ На главную',
        callback_data: await this.storeCallbackContext({
          event: 'back_to_main',
          chatId: context.chatId,
        }),
      },
    ]);

    await this.telegramBot.sendMessage(context.chatId, 'Выберите страну:', {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  }

  async sendMonitoredCompetitions(context: ICallbackContext) {
    const federation = federations.find(
      (f) => f.slug === context.federationSlug,
    );
    if (!federation) return;

    const monitoredRawTeams = await this.monitoringService.getMonitoredTeams(
      context.chatId,
    );

    const monitoredTeamIds = monitoredRawTeams.flatMap((f) => f.teamId);

    const teams = await this.dataprojectApiService
      .getClient(context.federationSlug)
      .getAllTeams();

    const monitoredTeams = teams.filter((t) =>
      monitoredTeamIds.some((id) => id === t.id),
    );

    const uniqMonitoredCompetitions = Array.from(
      new Set<string>(monitoredTeams.map((t) => t.competition)),
    );

    const keyboard = [];

    for (let i = 0; i < uniqMonitoredCompetitions.length; i += 2) {
      const row = [];

      for (let j = 0; j < 2 && i + j < uniqMonitoredCompetitions.length; j++) {
        const competition = uniqMonitoredCompetitions[i + j];
        row.push({
          text: `${competition}`,
          callback_data: await this.storeCallbackContext({
            event: 'send_monitored_competition_info',
            chatId: context.chatId,
            federationSlug: context.federationSlug,
            competition,
          }),
        });
      }

      keyboard.push(row);
    }

    keyboard.push([
      {
        text: '⬅️ Назад',
        callback_data: await this.storeCallbackContext({
          event: 'send_monitored_federations',
          chatId: context.chatId,
        }),
      },
    ]);

    this.telegramBot.sendMessage(
      context.chatId,
      `${federation.emoji} ${federation.name}\n\n🏆 Выберите лигу:`,
      {
        reply_markup: {
          inline_keyboard: keyboard,
        },
      },
    );
  }

  async sendMonitoredCompetitionInfo(context: ICallbackContext) {
    const client = this.dataprojectApiService.getClient(context.federationSlug);

    const monitoredRawTeams = await this.monitoringService.getMonitoredTeams(
      context.chatId,
      context.federationSlug,
    );

    const allTeams = await client.getAllTeams();
    const matches = await client.getMatchesInfo();

    let message = `📊 *Мониторинг\n🏆 ${context.competition}*\n\n`;

    for (const teamData of monitoredRawTeams) {
      const { teamId, players: playerIds } = teamData as MonitoredTeam;

      const team = allTeams.find(
        (t) => t.id === teamId && t.competition === context.competition,
      );
      if (!team) continue;

      const players = await client.getTeamRoster(teamId);

      const liveMatch = matches
        .flatMap((m) => [m.home, m.guest])
        .find((t) => t.id === teamId);

      let allPlayers = this.mergePlayers(
        players,
        liveMatch?.players ?? [],
      ).filter((p) => playerIds.includes(p.id));

      for (const player of allPlayers) {
        if (!player.statistic) {
          const stat = await client.getPlayerStatistic(player.id, team.id);
          if (stat) player.statistic = stat;
        }
      }

      allPlayers = allPlayers.sort(
        (a, b) => (b.statistic?.rating ?? 0) - (a.statistic?.rating ?? 0),
      );

      if (allPlayers.length === 0) continue;

      message += `👥 *${team.name}*\n`;

      for (const player of allPlayers) {
        message += this.formatPlayerInfo(player) + '\n';
      }

      message += '\n';
    }

    await this.telegramBot.sendMessage(context.chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '⬅️ Назад',
              callback_data: await this.storeCallbackContext({
                event: 'send_monitored_competitions',
                chatId: context.chatId,
                federationSlug: context.federationSlug,
              }),
            },
          ],
        ],
      },
    });
  }
  private mergePlayers(
    basePlayers: PlayerInfo[],
    livePlayers: PlayerInfo[],
  ): PlayerInfo[] {
    const playersMap = new Map<number, PlayerInfo>();

    basePlayers.forEach((player) => playersMap.set(player.id, player));
    livePlayers.forEach((player) => {
      if (!playersMap.has(player.id)) {
        playersMap.set(player.id, player);
      }
    });

    return Array.from(playersMap.values());
  }

  private formatPlayerInfo(player: PlayerInfo): string {
    const parts = [
      player.number ? `[[${player.number}]] ` : '',
      `\`${player.fullName}\``,
      player.position ? `_(${player.position})_` : '',
      player.statistic?.rating
        ? `⭐️ *${player.statistic.rating.toFixed(2)}*`
        : '⭐️ *0.00*',
    ];

    return parts.filter(Boolean).join(' ');
  }

  async sendStatisticFederations(context: ICallbackContext) {
    const keyboard = [];

    for (let i = 0; i < federations.length; i += 2) {
      const row = [];

      for (let j = 0; j < 2 && i + j < federations.length; j++) {
        const federation = federations[i + j];
        row.push({
          text: ` ${federation.emoji} ${federation.name}`,
          callback_data: await this.storeCallbackContext({
            chatId: context.chatId,
            event: 'send_statistic_competitions',
            federationSlug: federation.slug,
          }),
        });
      }

      keyboard.push(row);
    }

    keyboard.push([
      {
        text: '⬅️ На главную',
        callback_data: await this.storeCallbackContext({
          event: 'back_to_main',
          chatId: context.chatId,
        }),
      },
    ]);

    await this.telegramBot.sendMessage(context.chatId, 'Выберите страну:', {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  }

  async sendStatisticCompetitions(context: ICallbackContext) {
    const federation = federations.find(
      (f) => f.slug === context.federationSlug,
    );
    if (!federation) return;

    const teams = await this.dataprojectApiService
      .getClient(context.federationSlug)
      .getAllTeams();
    const competitions = Array.from(new Set(teams.map((t) => t.competition)));

    const keyboard = [];

    for (const competition of competitions) {
      keyboard.push([
        {
          text: competition,
          callback_data: await this.storeCallbackContext({
            chatId: context.chatId,
            event: 'send_statistic_teams',
            federationSlug: context.federationSlug,
            competition,
          }),
        },
      ]);
    }

    keyboard.push([
      {
        text: '⬅️ Назад',
        callback_data: await this.storeCallbackContext({
          event: 'send_statistic_federations',
          chatId: context.chatId,
        }),
      },
    ]);

    this.telegramBot.sendMessage(
      context.chatId,
      `${federation.emoji} ${federation.name}\n\n🏆 Выберите лигу:`,
      {
        reply_markup: {
          inline_keyboard: keyboard,
        },
      },
    );
  }

  async sendStatisticTeams(context: ICallbackContext) {
    const federation = federations.find(
      (f) => f.slug === context.federationSlug,
    );
    if (!federation) return;

    const client = this.dataprojectApiService.getClient(context.federationSlug);
    const teamList = await client.getAllTeams();
    const filteredTeams = teamList.filter(
      (t) => t.competition === context.competition,
    );

    const matches = await client.getMatchesInfo();
    const filteredMatches = matches.filter(
      (m) => m.competition === context.competition,
    );
    const matchTeams = filteredMatches.flatMap((m) => [m.guest, m.home]);
    const allTeams = [...filteredTeams, ...matchTeams];
    const uniqueTeamsMap = new Map<number, (typeof allTeams)[number]>();

    for (const team of allTeams) {
      uniqueTeamsMap.set(team.id, team);
    }

    const uniqueTeams = Array.from(uniqueTeamsMap.values()).sort((a, b) => {
      if (a.competition === b.competition) {
        return a.name.localeCompare(b.name);
      }
      return a.competition.localeCompare(b.competition);
    });
    const keyboard = [];

    for (const team of uniqueTeams) {
      keyboard.push([
        {
          text: `${team.name}`,
          callback_data: await this.storeCallbackContext({
            event: 'send_team_statistic',
            chatId: context.chatId,
            federationSlug: context.federationSlug,
            competition: context.competition,
            teamId: team.id,
          }),
        },
      ]);
    }

    keyboard.push([
      {
        text: '⬅️ Назад',
        callback_data: await this.storeCallbackContext({
          chatId: context.chatId,
          event: 'send_statistic_competitions',
          federationSlug: context.federationSlug,
        }),
      },
    ]);

    this.telegramBot.sendMessage(
      context.chatId,
      `${federation.emoji} ${federation.name}\n🏆 ${context.competition}\n\n👥 Выберите команду:`,
      {
        reply_markup: {
          inline_keyboard: keyboard,
        },
      },
    );
  }

  async sendTeamStatistic(context: ICallbackContext) {
    const federation = federations.find(
      (f) => f.slug === context.federationSlug,
    );
    if (!federation) return;
    const client = this.dataprojectApiService.getClient(context.federationSlug);

    const allTeams = await client.getAllTeams();
    const matches = await client.getMatchesInfo();

    const team = allTeams.find(
      (t) => t.id === context.teamId && t.competition === context.competition,
    );
    if (!team) {
      await this.telegramBot.sendMessage(context.chatId, 'Команда не найдена.');
      return;
    }

    const rosterPlayers = await client.getTeamRoster(team.id);

    const liveMatch = matches
      .flatMap((m) => [m.home, m.guest])
      .find((t) => t.id === team.id);

    let allPlayers = this.mergePlayers(rosterPlayers, liveMatch?.players ?? []);

    for (const player of allPlayers) {
      if (!player.statistic) {
        const stat = await client.getPlayerStatistic(player.id, team.id);
        if (stat) player.statistic = stat;
      }
    }

    allPlayers = allPlayers.sort(
      (a, b) => (b.statistic?.rating ?? 0) - (a.statistic?.rating ?? 0),
    );

    let message = '';
    message += `📊 *Статистика команды*\n${federation.emoji} *${federation.name}*\n🏆 *${context.competition}*\n👥 *${team.name}*\n\n`;

    for (const player of allPlayers) {
      message += this.formatPlayerInfo(player) + '\n';
    }

    await this.telegramBot.sendMessage(context.chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '⬅️ Назад',
              callback_data: await this.storeCallbackContext({
                chatId: context.chatId,
                event: 'send_statistic_teams',
                federationSlug: context.federationSlug,
                competition: context.competition,
              }),
            },
          ],
        ],
      },
    });
  }
}
