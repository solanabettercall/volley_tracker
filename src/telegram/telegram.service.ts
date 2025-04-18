import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as TelegramBot from 'node-telegram-bot-api';
import { appConfig } from 'src/config';
import { DataprojectApiService } from 'src/providers/dataproject/dataproject-api.service';
import { federations, FederationSlug } from 'src/providers/dataproject/types';

import { MonitoredTeam } from '../schemas/monitoring.schema';
import { MonitoringService } from 'src/monitoring/monitoring.service';
import { PlayerInfo } from 'src/providers/dataproject/interfaces/player-info.interface';
import { TeamInfo } from 'src/providers/dataproject/interfaces/team-info.interface';

@Injectable()
export class TelegramService implements OnApplicationBootstrap {
  private readonly telegramBot: TelegramBot;

  constructor(
    private readonly dataprojectApiService: DataprojectApiService,
    private readonly monitoringService: MonitoringService,
  ) {
    this.telegramBot = new TelegramBot(appConfig.tg.token, { polling: true });
  }

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
      const data = callbackQuery.data;

      if (!msg || !data) return;

      const [action, ...payload] = data.split(':');
      const chatId = msg.chat.id;
      switch (action) {
        case 'select_federation_menu':
          await this.sendFederations(chatId);
          break;
        case 'select_federation':
          // this.sendTeams(chatId, payload[0] as FederationSlug);
          await this.sendCompetitions(chatId, payload[0] as FederationSlug);
          break;
        case 'select_competition':
          await this.sendTeams(
            chatId,
            payload[0] as FederationSlug,
            payload[1],
          );

          break;

        case 'select_team':
          await this.sendPlayers(
            chatId,
            payload[0] as FederationSlug,
            payload[1],
            parseInt(payload[2]),
          );
          break;
        case 'toggle_player':
          await this.togglePlayer(
            chatId,
            payload[0] as FederationSlug,
            payload[1],
            parseInt(payload[2]),
            parseInt(payload[3]),
            msg.message_id,
          );
          break;
        case 'stop_monitoring':
          await this.stopMonitoring(
            chatId,
            payload[0] as FederationSlug,
            payload[1],
            parseInt(payload[2]),
          );
          break;
        case 'back_to_main':
          await this.sendMainMenu(chatId);
          break;
        case 'back_to_countries':
          await this.sendFederations(chatId);
          break;
        case 'back_to_competitions':
          await this.sendCompetitions(chatId, payload[0] as FederationSlug);
          break;
        case 'back_to_teams':
          await this.sendTeams(
            chatId,
            payload[0] as FederationSlug,
            payload[1],
          );
          break;
        case 'send_monitored_federations':
          await this.sendMonitoredFederations(chatId);
          break;

        case 'send_monitored_competitions':
          await this.sendMonitoredCompetitions(
            chatId,
            payload[0] as FederationSlug,
          );
          break;

        case 'send_monitored_competition_info':
          await this.sendMonitoredCompetitionInfo(
            chatId,
            payload[0] as FederationSlug,
            payload[1],
          );
          break;
      }

      this.telegramBot.answerCallbackQuery(callbackQuery.id);
    });
  }

  async sendCompetitions(chatId: number, federationSlug: FederationSlug) {
    const federation = federations.find((f) => f.slug === federationSlug);
    if (!federation) return;

    const client = this.dataprojectApiService.getClient(federationSlug);
    const teams = await client.getAllTeams();
    const competitions: Set<string> = new Set<string>(
      teams.map((t) => t.competition),
    );

    const keyboard = Array.from(competitions).reduce(
      (acc, competition, index) => {
        if (index % 2 === 0) {
          acc.push([
            {
              text: competition,
              callback_data: `select_competition:${federationSlug}:${competition}`,
            },
          ]);
        } else {
          acc[acc.length - 1].push({
            text: competition,
            callback_data: `select_competition:${federationSlug}:${competition}`,
          });
        }
        return acc;
      },
      [] as TelegramBot.InlineKeyboardButton[][],
    );

    keyboard.push([
      {
        text: '⬅️ Назад',
        callback_data: `back_to_countries`,
      },
    ]);

    this.telegramBot.sendMessage(
      chatId,
      `${federation.emoji} ${federation.name}\nВыберите лигу:`,
      {
        reply_markup: {
          inline_keyboard: keyboard,
        },
      },
    );
  }

  private async togglePlayer(
    userId: number,
    federationSlug: FederationSlug,
    competition: string,
    teamId: number,
    playerId: number,
    messageId: number,
  ) {
    Logger.debug('togglePlayer', {
      userId,
      federationSlug,
      teamId,
      playerId,
    });

    const monitoredTeam = await this.monitoringService.getPlayersForTeam(
      userId,
      federationSlug,
      teamId,
    );
    const alreadyMonitored = monitoredTeam.includes(playerId);

    if (alreadyMonitored) {
      await this.monitoringService.removePlayerFromMonitoring(
        userId,
        federationSlug,
        teamId,
        playerId,
      );
    } else {
      await this.monitoringService.addPlayerToMonitoring(
        userId,
        federationSlug,
        teamId,
        playerId,
      );
    }

    const players = await this.dataprojectApiService
      .getClient(federationSlug)
      .getTeamRoster(teamId);

    const updatedPlayerIds = await this.monitoringService.getPlayersForTeam(
      userId,
      federationSlug,
      teamId,
    );

    const keyboard = players.map((player) => [
      {
        text: `${updatedPlayerIds.includes(player.id) ? '✅' : '❌'} #${player.number} ${player.fullName}`,
        callback_data: `toggle_player:${federationSlug}:${competition}:${teamId}:${player.id}`,
      },
    ]);

    if (updatedPlayerIds.length > 0) {
      keyboard.push([
        {
          text: '🚫 Прекратить мониторинг команды',
          callback_data: `stop_monitoring:${federationSlug}:${teamId}`,
        },
      ]);
    }

    keyboard.push([
      {
        text: '⬅️ Назад',
        callback_data: `back_to_teams:${federationSlug}:${competition}`,
      },
      { text: '🏠 На главную', callback_data: 'back_to_main' },
    ]);

    await this.telegramBot.editMessageReplyMarkup(
      { inline_keyboard: keyboard },
      { chat_id: userId, message_id: messageId },
    );
  }

  private async stopMonitoring(
    chatId: number,
    federationSlug: FederationSlug,
    competition: string,
    teamId: number,
  ) {
    const monitoredPlayers = await this.monitoringService.getPlayersForTeam(
      chatId,
      federationSlug,
      teamId,
    );

    for (const playerId of monitoredPlayers) {
      await this.monitoringService.removePlayerFromMonitoring(
        chatId,
        federationSlug,
        teamId,
        playerId,
      );
    }

    const teams = await this.dataprojectApiService
      .getClient(federationSlug)
      .getAllTeams();

    const team = teams.find((t) => t.id === teamId);

    if (team) {
      const federation = federations.find((c) => c.slug === federationSlug);
      if (federation) {
        await this.sendTeams(chatId, federation.slug, competition);
      }
    }
  }

  private async sendMainMenu(chatId: number) {
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '🔍 Настроить мониторинг',
            callback_data: 'select_federation_menu',
          },
        ],
        [
          {
            text: '👁️ Текущий мониторинг',
            callback_data: 'send_monitored_federations',
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

  private async sendFederations(chatId: number) {
    const keyboard = federations.reduce((acc, federation, index) => {
      if (index % 2 === 0) {
        acc.push([
          {
            text: `${federation.emoji} ${federation.name}`,
            callback_data: `select_federation:${federation.slug}`,
          },
        ]);
      } else {
        acc[acc.length - 1].push({
          text: `${federation.emoji} ${federation.name}`,
          callback_data: `select_federation:${federation.slug}`,
        });
      }
      return acc;
    }, [] as TelegramBot.InlineKeyboardButton[][]);

    keyboard.push([{ text: '⬅️ На главную', callback_data: 'back_to_main' }]);

    await this.telegramBot.sendMessage(chatId, 'Выберите страну:', {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  }

  private async sendTeams(
    chatId: number,
    federationSlug: FederationSlug,
    competition: string,
  ) {
    const federation = federations.find((f) => f.slug === federationSlug);
    if (!federation) return;

    const client = this.dataprojectApiService.getClient(federationSlug);
    const teamList = await client.getAllTeams();
    const filteredTeams = teamList.filter((t) => t.competition === competition);

    const matches = await client.getMatchesInfo();
    const filteredMatches = matches.filter(
      (m) => m.competition === competition,
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
    const keyboard = uniqueTeams.map((team) => [
      {
        text: `${team.name}`,
        callback_data: `select_team:${federationSlug}:${competition}:${team.id}`,
      },
    ]);
    keyboard.push([
      {
        text: '⬅️ Назад',
        callback_data: `back_to_competitions:${federationSlug}`,
      },
    ]);

    this.telegramBot.sendMessage(
      chatId,
      `${federation.emoji} ${federation.name}\n🏆 ${competition}\nВыберите команду:`,
      {
        reply_markup: {
          inline_keyboard: keyboard,
        },
      },
    );
  }

  private async sendPlayers(
    chatId: number,
    federationSlug: FederationSlug,
    competition: string,
    teamId: number,
  ) {
    const players = await this.dataprojectApiService
      .getClient(federationSlug)
      .getTeamRoster(teamId);

    const matches = await this.dataprojectApiService
      .getClient(federationSlug as FederationSlug)
      .getMatchesInfo();

    const liveTeam = matches
      .flatMap((m) => [m.home, m.guest])
      .find((t) => t.id === teamId);

    let allPlayers = [...players];

    // Если есть liveTeam и у нее есть игроки, объединяем их
    if (liveTeam?.players) {
      // Используем Map для обеспечения уникальности по id
      const playersMap = new Map<number, PlayerInfo>();

      // Сначала добавляем игроков из основного списка
      players.forEach((player) => playersMap.set(player.id, player));

      // Затем добавляем игроков из liveTeam (перезаписываем только если их нет в основном списке)
      liveTeam.players.forEach((player) => {
        if (!playersMap.has(player.id)) {
          playersMap.set(player.id, player);
        }
      });
      allPlayers = Array.from(playersMap.values());
    }

    const teams = await this.dataprojectApiService
      .getClient(federationSlug)
      .getAllTeams();

    const team = teams.find((t) => t.id === teamId);
    const federation = federations.find((c) => c.slug === federationSlug);

    const monitoredPlayerIds = new Set(
      await this.monitoringService.getPlayersForTeam(
        chatId,
        federationSlug,
        teamId,
      ),
    );

    const keyboard = allPlayers.map((player) => [
      {
        text: `${monitoredPlayerIds.has(player.id) ? '✅' : '❌'} #${player.number} ${player.fullName}`,
        callback_data: `toggle_player:${federationSlug}:${competition}:${teamId}:${player.id}`,
      },
    ]);

    if (monitoredPlayerIds.size > 0) {
      keyboard.push([
        {
          text: '🚫 Прекратить мониторинг команды',
          callback_data: `stop_monitoring:${federationSlug}:${teamId}`,
        },
      ]);
    }

    keyboard.push([
      {
        text: '⬅️ Назад',
        callback_data: `back_to_teams:${federationSlug}:${competition}`,
      },
      { text: '🏠 На главную', callback_data: 'back_to_main' },
    ]);

    this.telegramBot.sendMessage(
      chatId,
      // `Команда: ${team?.name ?? 'Неизвестно'}\nСтрана: ${federation?.emoji ?? ''} ${federation?.name ?? ''}\nВыберите игроков для мониторинга:\n(❌ - не мониторится, ✅ - мониторится)`,

      `${federation.emoji} ${federation.name}\n🏆 ${competition}\n👥 ${team.name}\nВыберите игроков для мониторинга:\n(❌ - не мониторится, ✅ - мониторится)`,
      {
        reply_markup: {
          inline_keyboard: keyboard,
        },
      },
    );
  }

  private async sendMonitoredFederations(chatId: number) {
    const monitoredTeams =
      await this.monitoringService.getMonitoredTeams(chatId);

    const monitoredFederations = federations.filter((f) =>
      monitoredTeams.some((t) => t.federationSlug === f.slug),
    );

    if (!monitoredFederations || monitoredFederations.length === 0) {
      await this.telegramBot.sendMessage(
        chatId,
        'Сейчас у вас нет активного мониторинга игроков.',
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '🔍 Настроить мониторинг',
                  callback_data: 'select_federation_menu',
                },
              ],
              [{ text: '🏠 На главную', callback_data: 'back_to_main' }],
            ],
          },
        },
      );
      return;
    }

    const keyboard = monitoredFederations.reduce((acc, federation, index) => {
      if (index % 2 === 0) {
        acc.push([
          {
            text: `${federation.emoji} ${federation.name}`,
            callback_data: `send_monitored_competitions:${federation.slug}`,
          },
        ]);
      } else {
        acc[acc.length - 1].push({
          text: `${federation.emoji} ${federation.name}`,
          callback_data: `send_monitored_competitions:${federation.slug}`,
        });
      }
      return acc;
    }, [] as TelegramBot.InlineKeyboardButton[][]);

    keyboard.push([{ text: '⬅️ На главную', callback_data: 'back_to_main' }]);

    await this.telegramBot.sendMessage(chatId, 'Выберите страну:', {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  }

  async sendMonitoredCompetitions(
    chatId: number,
    federationSlug: FederationSlug,
  ) {
    const monitoredRawTeams =
      await this.monitoringService.getMonitoredTeams(chatId);

    const monitoredTeamIds = monitoredRawTeams.flatMap((f) => f.teamId);

    const teams = await this.dataprojectApiService
      .getClient(federationSlug)
      .getAllTeams();

    const monitoredTeams = teams.filter((t) =>
      monitoredTeamIds.some((id) => id === t.id),
    );

    const uniqMonitoredCompetitions = Array.from(
      new Set<string>(monitoredTeams.map((t) => t.competition)),
    );
    // console.log(uniqMonitoredCompetitions);

    // await this.telegramBot.sendMessage(
    //   chatId,
    //   uniqMonitoredCompetitions.toString(),
    // );

    // const monitoredFederations = federations.filter((f) =>
    //   monitoredTeams.some((t) => t.federationSlug === f.slug),
    // );

    // const client = this.dataprojectApiService.getClient(federationSlug);
    // const teams = await client.getAllTeams();
    // const competitions: Set<string> = new Set<string>(
    //   teams.map((t) => t.competition),
    // );

    const keyboard = uniqMonitoredCompetitions.reduce(
      (acc, competition, index) => {
        if (index % 2 === 0) {
          acc.push([
            {
              text: competition,
              callback_data: `send_monitored_competition_info:${federationSlug}:${competition}`,
            },
          ]);
        } else {
          acc[acc.length - 1].push({
            text: competition,
            callback_data: `send_monitored_competition_info:${federationSlug}:${competition}`,
          });
        }
        return acc;
      },
      [] as TelegramBot.InlineKeyboardButton[][],
    );

    keyboard.push([
      {
        text: '⬅️ Назад',
        callback_data: `send_monitored_federations`,
      },
    ]);

    this.telegramBot.sendMessage(chatId, 'Выберите лигу', {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  }

  async sendMonitoredCompetitionInfo(
    chatId: number,
    federationSlug: FederationSlug,
    competition: string,
  ) {
    const monitoredRawTeams = await this.monitoringService.getMonitoredTeams(
      chatId,
      federationSlug,
    );
    // const monitoredTeamIds = monitoredRawTeams.flatMap((f) => f.teamId);

    // const teams = await this.dataprojectApiService
    //   .getClient(federationSlug)
    //   .getAllTeams();

    // const monitoredTeams = teams
    //   .filter((t) => t.competition === competition)
    //   .filter((t) => monitoredTeamIds.some((id) => id === t.id));

    let message = '📊 Ваш текущий мониторинг:\n';

    const allTeams = await this.dataprojectApiService
      .getClient(federationSlug)
      .getAllTeams();

    for (const teamData of monitoredRawTeams) {
      const monitoredTeam = teamData as MonitoredTeam;
      const { teamId, players: playerIds } = monitoredTeam;
      const team = allTeams.find(
        (t) => t.id === teamId && t.competition === competition,
      );

      if (!team) continue;

      const players = await this.dataprojectApiService
        .getClient(federationSlug)
        .getTeamRoster(teamId);

      const matches = await this.dataprojectApiService
        .getClient(federationSlug as FederationSlug)
        .getMatchesInfo();

      const liveTeam = matches
        .flatMap((m) => [m.home, m.guest])
        .find((t) => t.id === teamId);

      let allPlayers = [...players];

      // Если есть liveTeam и у нее есть игроки, объединяем их
      if (liveTeam?.players) {
        // Используем Map для обеспечения уникальности по id
        const playersMap = new Map<number, PlayerInfo>();

        // Сначала добавляем игроков из основного списка
        players.forEach((player) => playersMap.set(player.id, player));

        // Затем добавляем игроков из liveTeam (перезаписываем только если их нет в основном списке)
        liveTeam.players.forEach((player) => {
          if (!playersMap.has(player.id)) {
            playersMap.set(player.id, player);
          }
        });
        allPlayers = Array.from(playersMap.values());
      }
      if (allPlayers.length > 0) {
        message += `${team.name}\n\n`;

        for (const player of allPlayers) {
          player.statistic = await this.dataprojectApiService
            .getClient(federationSlug)
            .getPlayerStatistic(player.id, team.id);

          const playerNumberString = player.number
            ? `*[${player.number}]* `
            : '';
          const playerNameString = `*${player.fullName}* `;
          const playerPositionString = player.position
            ? `_(${player.position})_ `
            : '';
          const playerRatingString = player.statistic?.rating
            ? `⭐️ *${player.statistic.rating.toFixed(2)}*`
            : '';

          message +=
            playerNumberString +
            playerNameString +
            playerPositionString +
            playerRatingString +
            '\n';
        }
        message += '\n';
      }
    }

    // const normalizedMessage = message.replace(
    //   /([_*[\]()~`>#+=|{}.!\\])/g,
    //   '\\$1',
    // );
    // console.log(normalizedMessage);
    this.telegramBot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '⬅️ Назад',
              callback_data: `send_monitored_competitions:${federationSlug}`,
            },
          ],
        ],
      },
    });
  }
}
