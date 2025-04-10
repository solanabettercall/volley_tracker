import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import * as TelegramBot from 'node-telegram-bot-api';

import { appConfig } from 'src/config';

@Injectable()
export class TelegramService implements OnApplicationBootstrap {
  private readonly telegramBot: TelegramBot;

  private readonly federations = ['🇮🇹 Италия', '🇫🇷 Франция'];
  private readonly teams = {
    '🇮🇹 Италия': ['Команда А', 'Команда Б'],
    '🇫🇷 Франция': ['Команда В', 'Команда Г'],
  };
  private readonly players = {
    'Команда А': ['Игрок 1', 'Игрок 2'],
    'Команда Б': ['Игрок 3', 'Игрок 4'],
    'Команда В': ['Игрок 5', 'Игрок 6'],
    'Команда Г': ['Игрок 7', 'Игрок 8'],
  };

  // Хранилище мониторинга: {chatId: {team: [players]}}
  private monitoredPlayers: Record<number, Record<string, string[]>> = {};

  constructor() {
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

      switch (action) {
        case 'select_federation_menu':
          this.sendFederations(chatId);
          break;
        case 'select_federation':
          this.sendTeams(chatId, payload[0]);
          break;
        case 'select_team':
          this.sendPlayers(chatId, payload[0]);
          break;
        case 'toggle_player':
          this.togglePlayer(chatId, payload[0], payload[1]);
          break;
        case 'stop_monitoring':
          this.stopMonitoring(chatId, payload[0]);
          break;
        case 'back_to_main':
          this.sendMainMenu(chatId);
          break;
        case 'back_to_federations':
          this.sendFederations(chatId);
          break;
        case 'back_to_teams':
          this.sendTeams(chatId, payload[0]);
          break;
        case 'view_monitoring':
          this.sendMonitoringStatus(chatId);
          break;
      }

      this.telegramBot.answerCallbackQuery(callbackQuery.id);
    });
  }

  private togglePlayer(chatId: number, team: string, player: string) {
    // Инициализируем структуру, если её нет
    if (!this.monitoredPlayers[chatId]) {
      this.monitoredPlayers[chatId] = {};
    }
    if (!this.monitoredPlayers[chatId][team]) {
      this.monitoredPlayers[chatId][team] = [];
    }

    const playerIndex = this.monitoredPlayers[chatId][team].indexOf(player);
    if (playerIndex === -1) {
      // Добавляем игрока в мониторинг
      this.monitoredPlayers[chatId][team].push(player);
    } else {
      // Удаляем игрока из мониторинга
      this.monitoredPlayers[chatId][team].splice(playerIndex, 1);
      // Если больше нет игроков в мониторинге для команды - удаляем команду
      if (this.monitoredPlayers[chatId][team].length === 0) {
        delete this.monitoredPlayers[chatId][team];
      }
    }

    // Обновляем список игроков
    this.sendPlayers(chatId, team);
  }

  private stopMonitoring(chatId: number, team: string) {
    if (this.monitoredPlayers[chatId] && this.monitoredPlayers[chatId][team]) {
      delete this.monitoredPlayers[chatId][team];
    }
    this.sendTeams(
      chatId,
      Object.keys(this.teams).find((federation) =>
        this.teams[federation].includes(team),
      ),
    );
  }

  private sendMainMenu(chatId: number) {
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

  private sendFederations(chatId: number) {
    const keyboard = this.federations.map((federation) => [
      {
        text: federation,
        callback_data: `select_federation:${federation}`,
      },
    ]);
    keyboard.push([{ text: '⬅️ На главную', callback_data: 'back_to_main' }]);

    this.telegramBot.sendMessage(chatId, 'Выберите федерацию:', {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  }

  private sendTeams(chatId: number, federation: string) {
    const teamList = this.teams[federation] || [];
    const keyboard = teamList.map((team) => [
      {
        text: team,
        callback_data: `select_team:${team}`,
      },
    ]);
    keyboard.push([{ text: '⬅️ Назад', callback_data: 'back_to_federations' }]);

    this.telegramBot.sendMessage(
      chatId,
      `Федерация: ${federation}\nВыберите команду:`,
      {
        reply_markup: {
          inline_keyboard: keyboard,
        },
      },
    );
  }

  private sendPlayers(chatId: number, team: string) {
    const playerList = this.players[team] || [];
    // Получаем список мониторящихся игроков (может быть undefined если чат/команда не инициализированы)
    const monitoredPlayers = this.monitoredPlayers[chatId]?.[team] || [];

    const keyboard = playerList.map((player) => [
      {
        // Отображаем ❌ если игрок не в мониторинге, ✅ если в мониторинге
        text: `${monitoredPlayers.includes(player) ? '✅' : '❌'} ${player}`,
        callback_data: `toggle_player:${team}:${player}`,
      },
    ]);

    // Добавляем кнопку "Прекратить мониторинг команды", если есть мониторинг
    if (monitoredPlayers.length > 0) {
      keyboard.push([
        {
          text: '🚫 Прекратить мониторинг команды',
          callback_data: `stop_monitoring:${team}`,
        },
      ]);
    }

    // Кнопки навигации
    const federation = Object.keys(this.teams).find((f) =>
      this.teams[f].includes(team),
    );
    keyboard.push([
      { text: '⬅️ Назад', callback_data: `back_to_teams:${federation}` },
      { text: '🏠 На главную', callback_data: 'back_to_main' },
    ]);

    this.telegramBot.sendMessage(
      chatId,
      `Команда: ${team}\nВыберите игроков для мониторинга:\n(❌ - не мониторится, ✅ - мониторится)`,
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

    let message = '📊 Ваш текущий мониторинг:\n\n';

    for (const [team, players] of Object.entries(monitored)) {
      const federation = Object.keys(this.teams).find((f) =>
        this.teams[f].includes(team),
      );

      message += `*${federation} - ${team}:*\n`;
      message += players.map((p) => `• ${p}`).join('\n');
      message += '\n\n';
    }

    const keyboard = [
      [
        {
          text: '✏️ Изменить мониторинг',
          callback_data: 'select_federation_menu',
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
