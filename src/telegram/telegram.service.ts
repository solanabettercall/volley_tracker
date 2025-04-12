import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as TelegramBot from 'node-telegram-bot-api';
import { appConfig } from 'src/config';
import { DataprojectApiService } from 'src/providers/dataproject/dataproject-api.service';
import { countries, CountrySlug } from 'src/providers/dataproject/types';

import { MonitoredTeam } from '../schemas/monitoring.schema';
import { MonitoringService } from 'src/monitoring/monitoring.service';
import { PlayerInfo } from 'src/providers/dataproject/interfaces/player-info.interface';

@Injectable()
export class TelegramService implements OnApplicationBootstrap {
  private readonly telegramBot: TelegramBot;

  constructor(
    private readonly dataprojectApiService: DataprojectApiService,
    private readonly monitoringService: MonitoringService,
  ) {
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
    userId: number,
    countrySlug: CountrySlug,
    teamId: number,
    playerId: number,
    messageId: number,
  ) {
    Logger.debug('togglePlayer', { userId, countrySlug, teamId, playerId });

    const monitoredTeam = await this.monitoringService.getPlayersForTeam(
      userId,
      countrySlug,
      teamId,
    );
    const alreadyMonitored = monitoredTeam.includes(playerId);

    if (alreadyMonitored) {
      await this.monitoringService.removePlayerFromMonitoring(
        userId,
        countrySlug,
        teamId,
        playerId,
      );
    } else {
      await this.monitoringService.addPlayerToMonitoring(
        userId,
        countrySlug,
        teamId,
        playerId,
      );
    }

    const players = await this.dataprojectApiService
      .getClient(countrySlug)
      .getTeamRoster(teamId);

    const updatedPlayerIds = await this.monitoringService.getPlayersForTeam(
      userId,
      countrySlug,
      teamId,
    );

    const keyboard = players.map((player) => [
      {
        text: `${updatedPlayerIds.includes(player.id) ? '✅' : '❌'} #${player.number} ${player.fullName}`,
        callback_data: `toggle_player:${countrySlug}:${teamId}:${player.id}`,
      },
    ]);

    if (updatedPlayerIds.length > 0) {
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
      { chat_id: userId, message_id: messageId },
    );
  }

  private async stopMonitoring(
    chatId: number,
    countrySlug: CountrySlug,
    teamId: number,
  ) {
    const monitoredPlayers = await this.monitoringService.getPlayersForTeam(
      chatId,
      countrySlug,
      teamId,
    );

    for (const playerId of monitoredPlayers) {
      await this.monitoringService.removePlayerFromMonitoring(
        chatId,
        countrySlug,
        teamId,
        playerId,
      );
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

    const matches = await this.dataprojectApiService
      .getClient(countrySlug as CountrySlug)
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
      .getClient(countrySlug)
      .getAllTeams();

    const team = teams.find((t) => t.id === teamId);
    const country = countries.find((c) => c.slug === countrySlug);

    const monitoredPlayerIds = new Set(
      await this.monitoringService.getPlayersForTeam(
        chatId,
        countrySlug,
        teamId,
      ),
    );

    const keyboard = allPlayers.map((player) => [
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

    this.telegramBot.sendMessage(
      chatId,
      `Команда: ${team?.name ?? 'Неизвестно'}\nСтрана: ${country?.emoji ?? ''} ${country?.name ?? ''}\nВыберите игроков для мониторинга:\n(❌ - не мониторится, ✅ - мониторится)`,
      {
        reply_markup: {
          inline_keyboard: keyboard,
        },
      },
    );
  }

  private async sendMonitoringStatus(chatId: number) {
    const monitoredTeams =
      await this.monitoringService.getMonitoredTeams(chatId);

    if (!monitoredTeams || monitoredTeams.length === 0) {
      await this.telegramBot.sendMessage(
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

    let message = '📊 Ваш текущий мониторинг:\n';

    const countriesMap: {
      [key: string]: {
        countryName: string;
        countryEmoji: string;
        teams: string[];
      };
    } = {};

    for (const teamData of monitoredTeams) {
      const monitoredTeam = teamData as MonitoredTeam;
      const { teamId, players, countrySlug } = monitoredTeam;

      // Пропускаем команды без игроков
      if (!players || players.length === 0) continue;

      const teamList = await this.dataprojectApiService
        .getClient(countrySlug as CountrySlug)
        .getAllTeams();

      const matches = await this.dataprojectApiService
        .getClient(countrySlug as CountrySlug)
        .getMatchesInfo();

      const liveTeams = matches.flatMap((m) => [m.guest, m.home]);

      const allTeamsMap = new Map();

      // Сначала добавляем команды из teamList
      teamList.forEach((team) => allTeamsMap.set(team.id, team));

      // Затем добавляем команды из liveTeams, но они не перезапишут существующие
      liveTeams.forEach((team) => {
        if (!allTeamsMap.has(team.id)) {
          allTeamsMap.set(team.id, team);
        }
      });

      // Получаем объединенный массив
      const allTeams = Array.from(allTeamsMap.values());

      const team = allTeams.find((t) => t.id === teamId);
      if (!team) continue;

      const country = countries.find((c) => c.slug === countrySlug);
      const countryEmoji = country ? country.emoji : '🌍';

      if (!countriesMap[countrySlug]) {
        countriesMap[countrySlug] = {
          countryName: country?.name || countrySlug,
          countryEmoji,
          teams: [],
        };
      }

      // Просто считаем длину массива отслеживаемых игроков
      const playerCount = players.length;

      countriesMap[countrySlug].teams.push(
        `*${team.name}:* (${playerCount} игроков)`,
      );
    }

    for (const countrySlug in countriesMap) {
      const { countryName, countryEmoji, teams } = countriesMap[countrySlug];
      message += `\n*${countryEmoji} ${countryName}:*\n`;
      message += teams.join('\n') + '\n';
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

    await this.telegramBot.sendMessage(
      chatId,
      message || 'Пока нет команд в мониторинге.',
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard },
      },
    );
  }
}
