import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as TelegramBot from 'node-telegram-bot-api';
import { appConfig } from 'src/config';
import { DataprojectApiService } from 'src/providers/dataproject/dataproject-api.service';
import { federations, FederationSlug } from 'src/providers/dataproject/types';

import { MonitoringService } from 'src/monitoring/monitoring.service';
import { PlayerInfo } from 'src/providers/dataproject/interfaces/player-info.interface';
import Redis from 'ioredis';
import * as stringify from 'json-stable-stringify';
import { createHash } from 'crypto';

interface ICallbackContext {
  event: string;
  chatId: number;
  federationSlug?: FederationSlug;
  competitionId?: number;
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

  private readonly TELEGRAM_MESSAGE_LIMIT = 1800;

  async sendMessage(
    userId: number,
    message: string,
    options?: TelegramBot.SendMessageOptions,
  ): Promise<TelegramBot.Message[]> {
    const messages: TelegramBot.Message[] = [];
    const lines = message.split('\n');

    let currentChunk = '';
    const chunks: string[] = [];

    for (const line of lines) {
      if ((currentChunk + line + '\n').length > this.TELEGRAM_MESSAGE_LIMIT) {
        chunks.push(currentChunk.trimEnd());
        currentChunk = '';
      }
      currentChunk += line + '\n';
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.trimEnd());
    }

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const opts = options ? { ...options } : undefined;

      if (opts && chunks.length > 1 && i !== chunks.length - 1) {
        opts.reply_markup = {
          ...opts.reply_markup,
          inline_keyboard: undefined,
        };
      }

      const sent = await this.telegramBot.sendMessage(userId, chunk, opts);
      messages.push(sent);
    }

    return messages;
  }

  async onApplicationBootstrap() {
    this.telegramBot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      if (appConfig.tg.adminId && chatId !== appConfig.tg.adminId) {
        return this.sendMessage(chatId, 'Нет доступа');
      }
      await this.sendMainMenu(chatId);
    });

    this.telegramBot.onText(/\/clear/, async (msg) => {
      const chatId = msg.chat.id;
      if (appConfig.tg.adminId && chatId !== appConfig.tg.adminId) {
        return this.sendMessage(chatId, 'Нет доступа');
      }
      await this.monitoringService.clearMonitoring(chatId);
      await this.sendMessage(chatId, 'Мониторинг успешно очищен');
    });

    this.telegramBot.on('callback_query', async (callbackQuery) => {
      const chatId = callbackQuery.from.id;
      if (appConfig.tg.adminId && chatId !== appConfig.tg.adminId) {
        return this.sendMessage(chatId, 'Нет доступа');
      }
      const msg = callbackQuery.message;
      const contextHash = callbackQuery.data;
      const context = await this.getCallbackContext(contextHash);
      const event: string | null = context?.event ?? null;

      if (!msg || !contextHash || !context) {
        await this.sendMainMenu(callbackQuery.from.id);
        await this.telegramBot.answerCallbackQuery(callbackQuery.id);
        return;
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
    const competitions = await client.getCompetitions();
    // console.log(competitions);
    // const teams = await client.getAllTeams();
    // const competitions: string[] = Array.from(
    //   new Set(teams.map((t) => t.competition)),
    // );

    const keyboard = [];
    for (const competition of competitions) {
      const key = await this.storeCallbackContext({
        event: 'select_competition',
        chatId: context.chatId,
        federationSlug: context.federationSlug,
        competitionId: competition.id,
      });
      keyboard.push([
        {
          text: competition.name || competition.fullName,
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

    await this.sendMessage(
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
      await this.monitoringService.removePlayerFromMonitoring({
        competitionId: context.competitionId,
        federationSlug: context.federationSlug,
        playerId: context.playerId,
        teamId: context.teamId,
        userId: context.chatId,
      });
    } else {
      await this.monitoringService.addPlayerToMonitoring({
        competitionId: context.competitionId,
        federationSlug: context.federationSlug,
        playerId: context.playerId,
        teamId: context.teamId,
        userId: context.chatId,
      });
    }

    const players = await this.dataprojectApiService
      .getClient(context.federationSlug)
      .getTeamRoster(context.teamId, context.competitionId);

    const updatedPlayerIds = await this.monitoringService.getPlayersForTeam(
      context.chatId,
      context.federationSlug,
      context.teamId,
    );

    const keyboard = [];
    for (const player of players) {
      keyboard.push([
        {
          text: `${updatedPlayerIds.includes(player.id) ? '✅' : '❌'} #${player.number ?? 0} ${player.fullName}`,
          callback_data: await this.storeCallbackContext({
            event: 'toggle_player',
            chatId: context.chatId,
            federationSlug: context.federationSlug,
            competitionId: context.competitionId,
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
            competitionId: context.competitionId,
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
          competitionId: context.competitionId,
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
      await this.monitoringService.removePlayerFromMonitoring({
        competitionId: context.competitionId,
        federationSlug: context.federationSlug,
        playerId,
        teamId: context.teamId,
        userId: context.chatId,
      });
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
    await this.sendMessage(chatId, 'Добро пожаловать! Выберите действие:', {
      reply_markup: keyboard,
    });
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

    await this.sendMessage(context.chatId, 'Выберите страну:', {
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
    const competition = await client.getCompetitionById(context.competitionId);
    const teamList = await client.getTeams(context.competitionId);

    const matches = await client.getMatchesInfo();
    const filteredMatches = matches.filter(
      (m) => m.competition.id === context.competitionId,
    );
    const matchTeams = filteredMatches.flatMap((m) => [m.guest, m.home]);
    const allTeams = [...teamList, ...matchTeams];
    const uniqueTeamsMap = new Map<number, (typeof allTeams)[number]>();

    for (const team of allTeams) {
      uniqueTeamsMap.set(team.id, team);
    }

    const uniqueTeams = Array.from(uniqueTeamsMap.values());

    const keyboard = [];

    for (const team of uniqueTeams) {
      keyboard.push([
        {
          text: `${team.name}`,
          callback_data: await this.storeCallbackContext({
            event: 'select_team',
            chatId: context.chatId,
            federationSlug: context.federationSlug,
            competitionId: context.competitionId,
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

    await this.sendMessage(
      context.chatId,
      `${federation.emoji} ${federation.name}\n🏆 ${competition.name || competition.fullName}\n\n👥 Выберите команду:`,
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
      .getTeamRoster(context.teamId, context.competitionId);

    const competition = await this.dataprojectApiService
      .getClient(context.federationSlug)
      .getCompetitionById(context.competitionId);

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
          text: `${monitoredPlayerIds.has(player.id) ? '✅' : '❌'} #${player.number ?? 0} ${player.fullName}`,
          callback_data: await this.storeCallbackContext({
            event: 'toggle_player',
            chatId: context.chatId,
            federationSlug: context.federationSlug,
            competitionId: context.competitionId,
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
            competitionId: context.competitionId,
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
          competitionId: context.competitionId,
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

    await this.sendMessage(
      context.chatId,
      `${federation.emoji} ${federation.name}\n🏆 ${competition.name || competition.fullName}\n👥 ${team.name}\n\nВыберите игроков для мониторинга:\n(❌ - не мониторится, ✅ - мониторится)`,
      {
        reply_markup: {
          inline_keyboard: keyboard,
        },
      },
    );
  }

  private async sendMonitoredFederations(context: ICallbackContext) {
    const monitoredFederationsSlug =
      await this.monitoringService.getMonitoredFederationSlugs(context.chatId);

    const monitoredFederations = federations.filter((f) =>
      monitoredFederationsSlug.some((slug) => slug === f.slug),
    );

    if (!monitoredFederations || monitoredFederations.length === 0) {
      await this.sendMessage(
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

    await this.sendMessage(context.chatId, 'Выберите страну:', {
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

    const monitoredCompetitionIds =
      await this.monitoringService.getMonitoredCompetitionIds(
        context.chatId,
        context.federationSlug,
      );

    const allCompetitions = await this.dataprojectApiService
      .getClient(context.federationSlug)
      .getCompetitions();

    const monitoredCompetitions = allCompetitions.filter((c) =>
      monitoredCompetitionIds.includes(c.id),
    );

    const keyboard = [];

    for (let i = 0; i < monitoredCompetitions.length; i += 2) {
      const row = [];

      for (let j = 0; j < 2 && i + j < monitoredCompetitions.length; j++) {
        const competition = monitoredCompetitions[i + j];
        row.push({
          text: competition.name || competition.fullName,
          callback_data: await this.storeCallbackContext({
            event: 'send_monitored_competition_info',
            chatId: context.chatId,
            federationSlug: context.federationSlug,
            competitionId: competition.id,
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

    await this.sendMessage(
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
    const competition = await client.getCompetitionById(context.competitionId);

    const monitoredRawTeams = await this.monitoringService.getMonitoredTeams(
      context.chatId,
      context.federationSlug,
      context.competitionId,
    );

    const allTeams = await client.getTeams(context.competitionId);
    const matches = await client.getMatchesInfo();

    let message = `📊 *Мониторинг\n🏆 ${competition.name}*\n\n`;

    for (const teamData of monitoredRawTeams) {
      const { teamId, players: playerIds } = teamData;
      const team = allTeams.find((t) => t.id === teamId);
      if (!team) continue;

      const players = await client.getTeamRoster(teamId, context.competitionId);

      const liveMatch = matches
        .flatMap((m) => [m.home, m.guest])
        .find((t) => t.id === teamId);

      let allPlayers = this.mergePlayers(
        players,
        liveMatch?.players ?? [],
      ).filter((p) => playerIds.includes(p.id));

      for (const player of allPlayers) {
        if (!player.statistic) {
          const stat = await client.getPlayerStatistic(
            player.id,
            team.id,
            context.competitionId,
          );
          if (stat) player.statistic = stat;
        }
      }

      allPlayers = this.sortPlayersByRating(allPlayers);

      if (allPlayers.length === 0) continue;

      message += `👥 *${team.name}*\n`;

      for (const player of allPlayers) {
        message += this.formatPlayerInfo(player) + '\n';
      }

      message += '\n';
    }

    await this.sendMessage(context.chatId, message, {
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
  private sortPlayersByRating(allPlayers: PlayerInfo[]) {
    return allPlayers.sort((a, b) => {
      if (a.statistic?.rating === null || a.statistic?.rating === undefined)
        return 1;
      if (b.statistic?.rating === null || b.statistic?.rating === undefined)
        return -1;
      return b.statistic?.rating - a.statistic?.rating;
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
    let ratingPart = '';
    if (player.statistic) {
      ratingPart += player.statistic?.rating
        ? `\n⭐️ *${player.statistic.rating.toFixed(2)}*`
        : '\n⭐️ *0.00*';
      ratingPart += ` (${player.statistic.totalPoints ?? 0}/${player.statistic.playedSetsCount})`;
    }

    const parts = [
      player.number ? `[[${player.number}]] ` : '',
      `*${player.fullName}*`,
      player.position ? `_(${player.position})_` : '',
      ratingPart,
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

    await this.sendMessage(context.chatId, 'Выберите страну:', {
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

    const competitions = await this.dataprojectApiService
      .getClient(context.federationSlug)
      .getCompetitions();

    const keyboard = [];

    for (const competition of competitions) {
      keyboard.push([
        {
          text: competition.name || competition.fullName,
          callback_data: await this.storeCallbackContext({
            chatId: context.chatId,
            event: 'send_statistic_teams',
            federationSlug: context.federationSlug,
            competitionId: competition.id,
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

    await this.sendMessage(
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
    const competition = await client.getCompetitionById(context.competitionId);
    const teamList = await client.getTeams(context.competitionId);

    const matches = await client.getMatchesInfo();
    const filteredMatches = matches.filter(
      (m) => m.competition.id === context.competitionId,
    );
    const matchTeams = filteredMatches.flatMap((m) => [m.guest, m.home]);
    const allTeams = [...teamList, ...matchTeams];
    const uniqueTeamsMap = new Map<number, (typeof allTeams)[number]>();

    for (const team of allTeams) {
      uniqueTeamsMap.set(team.id, team);
    }

    const uniqueTeams = Array.from(uniqueTeamsMap.values());
    const keyboard = [];

    for (const team of uniqueTeams) {
      keyboard.push([
        {
          text: `${team.name}`,
          callback_data: await this.storeCallbackContext({
            event: 'send_team_statistic',
            chatId: context.chatId,
            federationSlug: context.federationSlug,
            competitionId: context.competitionId,
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

    await this.sendMessage(
      context.chatId,
      `${federation.emoji} ${federation.name}\n🏆 ${competition.name || competition.fullName}\n\n👥 Выберите команду:`,
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
    const competition = await client.getCompetitionById(context.competitionId);
    const teams = await client.getTeams(context.competitionId);
    const matches = await client.getMatchesInfo();

    const team = teams.find((t) => t.id === context.teamId);
    if (!team) {
      await this.sendMessage(context.chatId, 'Команда не найдена.');
      return;
    }

    const rosterPlayers = await client.getTeamRoster(
      team.id,
      context.competitionId,
    );

    const liveMatch = matches
      .flatMap((m) => [m.home, m.guest])
      .find((t) => t.id === team.id);

    let allPlayers = this.mergePlayers(rosterPlayers, liveMatch?.players ?? []);

    for (const player of allPlayers) {
      if (!player.statistic) {
        const stat = await client.getPlayerStatistic(
          player.id,
          team.id,
          context.competitionId,
        );
        if (stat) player.statistic = stat;
      }
    }

    allPlayers = allPlayers.sort((a, b) => {
      if (a.statistic?.rating === null || a.statistic?.rating === undefined)
        return 1;
      if (b.statistic?.rating === null || b.statistic?.rating === undefined)
        return -1;
      return b.statistic.rating - a.statistic.rating;
    });

    let message = '';
    message += `📊 *Статистика команды*\n${federation.emoji} *${federation.name}*\n🏆 *${competition.name || competition.fullName}*\n👥 *${team.name}*\n\n`;

    for (const player of allPlayers) {
      message += this.formatPlayerInfo(player) + '\n';
    }

    await this.sendMessage(context.chatId, message, {
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
                competitionId: context.competitionId,
              }),
            },
          ],
        ],
      },
    });
  }
}
