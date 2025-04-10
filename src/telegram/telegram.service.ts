import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import * as TelegramBot from 'node-telegram-bot-api';
import { appConfig } from 'src/config';
import { DataprojectApiService } from 'src/providers/dataproject/dataproject-api.service';
import { TeamInfo } from 'src/providers/dataproject/interfaces/team-info.interface';
import { countries, CountrySlug } from 'src/providers/dataproject/types';

@Injectable()
export class TelegramService implements OnApplicationBootstrap {
  private readonly telegramBot: TelegramBot;

  private monitoredPlayers: Record<number, Record<number, number[]>> = {};

  private teamsData: Record<CountrySlug, TeamInfo[]> = {} as Record<
    CountrySlug,
    TeamInfo[]
  >;

  constructor(private readonly dataprojectApiService: DataprojectApiService) {
    this.telegramBot = new TelegramBot(appConfig.tg.token, { polling: true });
    this.initializeMockTeamsData();
  }

  private initializeMockTeamsData() {
    countries.forEach((country) => {
      this.teamsData[country.slug] = [
        {
          id: Math.floor(Math.random() * 10000),
          name: `${country.name} Team A`,
          players: [
            { id: 1, number: 1, fullName: 'Player 1' },
            { id: 2, number: 2, fullName: 'Player 2' },
          ],
        },
        {
          id: Math.floor(Math.random() * 10000),
          name: `${country.name} Team B`,
          players: [
            { id: 3, number: 3, fullName: 'Player 3' },
            { id: 4, number: 4, fullName: 'Player 4' },
          ],
        },
      ];
    });
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

      switch (action) {
        case 'select_country_menu':
          this.sendCountries(chatId);
          break;
        case 'select_country':
          this.sendTeams(chatId, payload[0] as CountrySlug);
          break;
        case 'select_team':
          this.sendPlayers(chatId, parseInt(payload[0]));
          break;
        case 'toggle_player':
          this.togglePlayer(chatId, parseInt(payload[0]), parseInt(payload[1]));
          break;
        case 'stop_monitoring':
          this.stopMonitoring(chatId, parseInt(payload[0]));
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

  private togglePlayer(chatId: number, teamId: number, playerId: number) {
    if (!this.monitoredPlayers[chatId]) {
      this.monitoredPlayers[chatId] = {};
    }
    if (!this.monitoredPlayers[chatId][teamId]) {
      this.monitoredPlayers[chatId][teamId] = [];
    }

    const playerIndex = this.monitoredPlayers[chatId][teamId].indexOf(playerId);
    if (playerIndex === -1) {
      this.monitoredPlayers[chatId][teamId].push(playerId);
    } else {
      this.monitoredPlayers[chatId][teamId].splice(playerIndex, 1);
      if (this.monitoredPlayers[chatId][teamId].length === 0) {
        delete this.monitoredPlayers[chatId][teamId];
      }
    }

    this.sendPlayers(chatId, teamId);
  }

  private stopMonitoring(chatId: number, teamId: number) {
    if (this.monitoredPlayers[chatId]?.[teamId]) {
      delete this.monitoredPlayers[chatId][teamId];
    }

    const team = this.findTeamById(teamId);
    if (team) {
      const country = this.findCountryByTeam(team);
      if (country) {
        this.sendTeams(chatId, country.slug);
      }
    }
  }

  private findTeamById(teamId: number): TeamInfo | undefined {
    for (const country of countries) {
      const team = this.teamsData[country.slug]?.find((t) => t.id === teamId);
      if (team) return team;
    }
    return undefined;
  }

  private findCountryByTeam(
    team: TeamInfo,
  ): { slug: CountrySlug; name: string; emoji: string } | undefined {
    return countries.find((country) =>
      this.teamsData[country.slug]?.some((t) => t.id === team.id),
    );
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

  private sendTeams(chatId: number, countrySlug: CountrySlug) {
    const country = countries.find((c) => c.slug === countrySlug);
    if (!country) return;

    const teamList = this.teamsData[countrySlug] || [];
    const keyboard = teamList.map((team) => [
      {
        text: team.name,
        callback_data: `select_team:${team.id}`,
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

  private sendPlayers(chatId: number, teamId: number) {
    const team = this.findTeamById(teamId);
    if (!team) return;

    const country = this.findCountryByTeam(team);
    if (!country) return;

    const monitoredPlayers = this.monitoredPlayers[chatId]?.[teamId] || [];

    const keyboard = team.players.map((player) => [
      {
        text: `${monitoredPlayers.includes(player.id) ? '✅' : '❌'} #${player.number} ${player.fullName}`,
        callback_data: `toggle_player:${teamId}:${player.id}`,
      },
    ]);

    if (monitoredPlayers.length > 0) {
      keyboard.push([
        {
          text: '🚫 Прекратить мониторинг команды',
          callback_data: `stop_monitoring:${teamId}`,
        },
      ]);
    }

    keyboard.push([
      { text: '⬅️ Назад', callback_data: `back_to_teams:${country.slug}` },
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

  private sendMonitoringStatus(chatId: number) {
    const monitored = this.monitoredPlayers[chatId];

    if (!monitored || Object.keys(monitored).length === 0) {
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

    for (const [teamId, playerIds] of Object.entries(monitored)) {
      const team = this.findTeamById(parseInt(teamId));
      if (!team) continue;

      const country = this.findCountryByTeam(team);
      if (!country) continue;

      const players = team.players.filter((p) => playerIds.includes(p.id));

      message += `*${country.emoji} ${country.name} - ${team.name}:*\n`;
      message += players.map((p) => `• #${p.number} ${p.fullName}`).join('\n');
      message += '\n\n';
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

    this.telegramBot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard },
    });
  }
}
