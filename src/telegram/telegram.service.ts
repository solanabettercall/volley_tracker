import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as TelegramBot from 'node-telegram-bot-api';
import { appConfig } from 'src/config';
import { DataprojectApiService } from 'src/providers/dataproject/dataproject-api.service';
import { countries, CountrySlug } from 'src/providers/dataproject/types';

interface MonitoredTeam {
  teamId: number;
  players: Set<number>;
}

interface MonitoredCountry {
  countrySlug: CountrySlug;
  teams: Map<number, MonitoredTeam>;
}

type UserMonitoring = Map<CountrySlug, MonitoredCountry>;
type MonitoredPlayersStorage = Map<number, UserMonitoring>;

@Injectable()
export class TelegramService implements OnApplicationBootstrap {
  private readonly telegramBot: TelegramBot;

  private monitoredPlayers: MonitoredPlayersStorage = new Map();

  constructor(private readonly dataprojectApiService: DataprojectApiService) {
    this.telegramBot = new TelegramBot(appConfig.tg.token, { polling: true });
  }

  async onApplicationBootstrap() {
    this.telegramBot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      this.sendMainMenu(chatId);
    });

    this.telegramBot.on('callback_query', async (callbackQuery) => {
      const msg = callbackQuery.message;
      const data = callbackQuery.data;

      if (!msg || !data) return;

      const [action, ...payload] = data.split(':');
      const chatId = msg.chat.id;
      console.log(callbackQuery);
      switch (action) {
        case 'select_country_menu':
          this.sendCountries(chatId);
          break;
        case 'select_country':
          this.sendTeams(chatId, payload[0] as CountrySlug);
          break;
        case 'select_team':
          this.sendPlayers(
            chatId,
            payload[0] as CountrySlug,
            parseInt(payload[1]),
          );
          break;
        case 'toggle_player':
          this.togglePlayer(
            chatId,
            payload[0] as CountrySlug,
            parseInt(payload[1]),
            parseInt(payload[2]),
            msg.message_id,
          );
          break;
        case 'stop_monitoring':
          this.stopMonitoring(
            chatId,
            payload[0] as CountrySlug,
            parseInt(payload[1]),
          );
          break;
        case 'back_to_main':
          this.sendMainMenu(chatId);
          break;
        case 'back_to_countries':
          this.sendCountries(chatId);
          break;
        case 'back_to_teams':
          this.sendTeams(chatId, payload[0] as CountrySlug);
          break;
        case 'view_monitoring':
          this.sendMonitoringStatus(chatId);
          break;
      }

      this.telegramBot.answerCallbackQuery(callbackQuery.id);
    });
  }

  private async togglePlayer(
    chatId: number,
    countrySlug: CountrySlug,
    teamId: number,
    playerId: number,
    messageId: number,
  ) {
    Logger.debug('togglePlayer', {
      chatId,
      countrySlug,
      teamId,
      playerId,
    });

    if (!this.monitoredPlayers.has(chatId)) {
      this.monitoredPlayers.set(chatId, new Map());
    }

    const userMonitoring = this.monitoredPlayers.get(chatId)!;

    if (!userMonitoring.has(countrySlug)) {
      userMonitoring.set(countrySlug, {
        countrySlug,
        teams: new Map(),
      });
    }

    const monitoredCountry = userMonitoring.get(countrySlug)!;

    if (!monitoredCountry.teams.has(teamId)) {
      monitoredCountry.teams.set(teamId, {
        teamId,
        players: new Set(),
      });
    }

    const monitoredTeam = monitoredCountry.teams.get(teamId)!;

    if (monitoredTeam.players.has(playerId)) {
      monitoredTeam.players.delete(playerId);

      if (monitoredTeam.players.size === 0) {
        monitoredCountry.teams.delete(teamId);
      }

      if (monitoredCountry.teams.size === 0) {
        userMonitoring.delete(countrySlug);
      }

      if (userMonitoring.size === 0) {
        this.monitoredPlayers.delete(chatId);
      }
    } else {
      monitoredTeam.players.add(playerId);
    }

    const players = await this.dataprojectApiService
      .getClient(countrySlug)
      .getTeamRoster(teamId);

    const monitoredPlayerIds = monitoredTeam?.players ?? new Set();

    const keyboard = players.map((player) => [
      {
        text: `${monitoredPlayerIds.has(player.id) ? '✅' : '❌'} #${player.number} ${player.fullName}`,
        callback_data: `toggle_player:${countrySlug}:${teamId}:${player.id}`,
      },
    ]);

    if (monitoredPlayerIds.size > 0) {
      keyboard.push([
        {
          text: '🚫 Прекратить мониторинг команды',
          callback_data: `stop_monitoring:${countrySlug}:${teamId}`,
        },
      ]);
    }

    keyboard.push([
      { text: '⬅️ Назад', callback_data: `back_to_teams:${countrySlug}` },
      { text: '🏠 На главную', callback_data: 'back_to_main' },
    ]);

    await this.telegramBot.editMessageReplyMarkup(
      { inline_keyboard: keyboard },
      { chat_id: chatId, message_id: messageId },
    );
  }

  private async stopMonitoring(
    chatId: number,
    countrySlug: CountrySlug,
    teamId: number,
  ) {
    const userMonitoring = this.monitoredPlayers.get(chatId);
    const countryMonitoring = userMonitoring?.get(countrySlug);

    if (countryMonitoring?.teams.has(teamId)) {
      countryMonitoring.teams.delete(teamId);

      if (countryMonitoring.teams.size === 0) {
        userMonitoring.delete(countrySlug);
      }

      if (userMonitoring.size === 0) {
        this.monitoredPlayers.delete(chatId);
      }
    }

    const teams = await this.dataprojectApiService
      .getClient(countrySlug)
      .getAllTeams();
    const team = teams.find((t) => t.id === teamId);

    if (team) {
      const country = countries.find((c) => c.slug === countrySlug);
      if (country) {
        this.sendTeams(chatId, country.slug);
      }
    }
  }

  private sendMainMenu(chatId: number) {
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '🔍 Настроить мониторинг',
            callback_data: 'select_country_menu',
          },
        ],
        [
          {
            text: '👁️ Текущий мониторинг',
            callback_data: 'view_monitoring',
          },
        ],
      ],
    };
    this.telegramBot.sendMessage(
      chatId,
      'Добро пожаловать! Выберите действие:',
      { reply_markup: keyboard },
    );
  }

  private sendCountries(chatId: number) {
    const keyboard = countries.reduce((acc, country, index) => {
      if (index % 2 === 0) {
        acc.push([
          {
            text: `${country.emoji} ${country.name}`,
            callback_data: `select_country:${country.slug}`,
          },
        ]);
      } else {
        acc[acc.length - 1].push({
          text: `${country.emoji} ${country.name}`,
          callback_data: `select_country:${country.slug}`,
        });
      }
      return acc;
    }, [] as TelegramBot.InlineKeyboardButton[][]);

    keyboard.push([{ text: '⬅️ На главную', callback_data: 'back_to_main' }]);

    this.telegramBot.sendMessage(chatId, 'Выберите страну:', {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  }

  private async sendTeams(chatId: number, countrySlug: CountrySlug) {
    const country = countries.find((c) => c.slug === countrySlug);
    if (!country) return;

    const client = this.dataprojectApiService.getClient(countrySlug);
    const teamList = await client.getAllTeams();
    const matches = await client.getMatchesInfo();
    const matchTeams = matches.flatMap((m) => [m.guest, m.home]);
    const allTeams = [...teamList, ...matchTeams];
    const uniqueTeamsMap = new Map<number, (typeof allTeams)[number]>();

    for (const team of allTeams) {
      uniqueTeamsMap.set(team.id, team);
    }

    const uniqueTeams = Array.from(uniqueTeamsMap.values());

    const keyboard = uniqueTeams.map((team) => [
      {
        text: team.name,
        callback_data: `select_team:${countrySlug}:${team.id}`,
      },
    ]);
    keyboard.push([{ text: '⬅️ Назад', callback_data: 'back_to_countries' }]);

    this.telegramBot.sendMessage(
      chatId,
      `Страна: ${country.emoji} ${country.name}\nВыберите команду:`,
      {
        reply_markup: {
          inline_keyboard: keyboard,
        },
      },
    );
  }

  private async sendPlayers(
    chatId: number,
    countrySlug: CountrySlug,
    teamId: number,
  ) {
    const players = await this.dataprojectApiService
      .getClient(countrySlug)
      .getTeamRoster(teamId);

    const teams = await this.dataprojectApiService
      .getClient(countrySlug)
      .getAllTeams();

    const team = teams.find((t) => t.id === teamId);
    const country = countries.find((c) => c.slug === countrySlug);

    const userMonitoring = this.monitoredPlayers.get(chatId);
    const countryMonitoring = userMonitoring?.get(countrySlug);
    const teamMonitoring = countryMonitoring?.teams.get(teamId);
    const monitoredPlayers = teamMonitoring
      ? teamMonitoring.players
      : new Set();

    const keyboard = players.map((player) => [
      {
        text: `${monitoredPlayers.has(player.id) ? '✅' : '❌'} #${player.number} ${player.fullName}`,
        callback_data: `toggle_player:${countrySlug}:${teamId}:${player.id}`,
      },
    ]);

    if (monitoredPlayers.size > 0) {
      keyboard.push([
        {
          text: '🚫 Прекратить мониторинг команды',
          callback_data: `stop_monitoring:${countrySlug}:${teamId}`,
        },
      ]);
    }

    keyboard.push([
      { text: '⬅️ Назад', callback_data: `back_to_teams:${countrySlug}` },
      { text: '🏠 На главную', callback_data: 'back_to_main' },
    ]);

    this.telegramBot.sendMessage(
      chatId,
      `Команда: ${team.name}\nСтрана: ${country.emoji} ${country.name}\nВыберите игроков для мониторинга:\n(❌ - не мониторится, ✅ - мониторится)`,
      {
        reply_markup: {
          inline_keyboard: keyboard,
        },
      },
    );
  }

  private async sendMonitoringStatus(chatId: number) {
    const monitored = this.monitoredPlayers.get(chatId);

    if (!monitored || monitored.size === 0) {
      this.telegramBot.sendMessage(
        chatId,
        'Сейчас у вас нет активного мониторинга игроков.',
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '🔍 Настроить мониторинг',
                  callback_data: 'select_country_menu',
                },
              ],
              [{ text: '🏠 На главную', callback_data: 'back_to_main' }],
            ],
          },
        },
      );
      return;
    }

    let message = '📊 Ваш текущий мониторинг:\n\n';

    for (const [countrySlug, country] of monitored.entries()) {
      const teamList = await this.dataprojectApiService
        .getClient(countrySlug)
        .getAllTeams();

      for (const [teamId, teamData] of country.teams.entries()) {
        const team = teamList.find((t) => t.id === teamId);
        const countryMeta = countries.find((c) => c.slug === countrySlug);

        if (!team || !countryMeta) continue;

        const teamRoster = await this.dataprojectApiService
          .getClient(countrySlug)
          .getTeamRoster(teamId);

        const players = teamRoster.filter((p) => teamData.players.has(p.id));

        if (players.length > 0) {
          message += `*${countryMeta.emoji} ${countryMeta.name} - ${team.name}:*\n`;
          message += players
            .map((p) => `• #${p.number} ${p.fullName}`)
            .join('\n');
          message += '\n\n';
        }
      }
    }

    const keyboard = [
      [
        {
          text: '✏️ Изменить мониторинг',
          callback_data: 'select_country_menu',
        },
        { text: '🏠 На главную', callback_data: 'back_to_main' },
      ],
    ];

    this.telegramBot.sendMessage(
      chatId,
      message || 'Пока нет игроков в мониторинге.',
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard },
      },
    );
  }
}
