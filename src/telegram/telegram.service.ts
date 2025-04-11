import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as TelegramBot from 'node-telegram-bot-api';
import { appConfig } from 'src/config';
import { DataprojectApiService } from 'src/providers/dataproject/dataproject-api.service';
import { TeamInfo } from 'src/providers/dataproject/interfaces/team-info.interface';
import { countries, CountrySlug } from 'src/providers/dataproject/types';

@Injectable()
export class TelegramService implements OnApplicationBootstrap {
  private readonly telegramBot: TelegramBot;

  private monitoredPlayers: Record<
    number,
    Record<string, Record<number, number[]>>
  > = {};

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
    messageId: number, // Добавляем ID сообщения для редактирования
  ) {
    const citySlug = countrySlug; // Используем citySlug как countrySlug
    Logger.debug('togglePlayer', {
      chatId,
      countrySlug,
      teamId,
      playerId,
    });

    // Инициализируем структуру данных, если её нет
    if (!this.monitoredPlayers[chatId]) {
      this.monitoredPlayers[chatId] = {};
    }
    if (!this.monitoredPlayers[chatId][citySlug]) {
      this.monitoredPlayers[chatId][citySlug] = {};
    }
    if (!this.monitoredPlayers[chatId][citySlug][teamId]) {
      this.monitoredPlayers[chatId][citySlug][teamId] = [];
    }

    // Проверка на наличие игрока в списке
    const playerIndex =
      this.monitoredPlayers[chatId]?.[citySlug]?.[teamId]?.indexOf(playerId);

    if (playerIndex === -1) {
      // Добавляем игрока в список мониторинга
      this.monitoredPlayers[chatId][citySlug][teamId].push(playerId);
    } else {
      // Удаляем игрока из списка мониторинга
      this.monitoredPlayers[chatId][citySlug][teamId].splice(playerIndex, 1);
      // Если больше нет игроков, удаляем запись о команде
      if (this.monitoredPlayers[chatId][citySlug][teamId].length === 0) {
        delete this.monitoredPlayers[chatId][citySlug][teamId];
      }
    }

    // Получаем список игроков для команды
    const players = await this.dataprojectApiService
      .getClient(countrySlug)
      .getTeamRoster(teamId);

    const teams = await this.dataprojectApiService
      .getClient(countrySlug)
      .getAllTeams();
    const team = teams.find((t) => t.id === teamId);
    const country = countries.find((c) => c.slug === countrySlug);

    const monitoredPlayers =
      this.monitoredPlayers[chatId]?.[citySlug]?.[teamId] || [];

    // Создаем клавиатуру
    const keyboard = players.map((player) => [
      {
        text: `${monitoredPlayers.includes(player.id) ? '✅' : '❌'} #${player.number} ${player.fullName}`,
        callback_data: `toggle_player:${countrySlug}:${teamId}:${player.id}`,
      },
    ]);

    // Если есть активные игроки в мониторинге, добавляем кнопку для прекращения мониторинга
    if (monitoredPlayers.length > 0) {
      keyboard.push([
        {
          text: '🚫 Прекратить мониторинг команды',
          callback_data: `stop_monitoring:${countrySlug}:${teamId}`,
        },
      ]);
    }

    // Добавляем кнопки для возврата
    keyboard.push([
      { text: '⬅️ Назад', callback_data: `back_to_teams:${countrySlug}` },
      { text: '🏠 На главную', callback_data: 'back_to_main' },
    ]);

    // Обновляем клавиатуру в сообщении
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
    // Используем citySlug вместо countrySlug
    const citySlug = countrySlug; // или извлекаем citySlug из другого источника

    if (this.monitoredPlayers[chatId]?.[citySlug]?.[teamId]) {
      delete this.monitoredPlayers[chatId][citySlug][teamId];
    }

    // Получаем данные команды
    const teams = await this.dataprojectApiService
      .getClient(countrySlug)
      .getAllTeams();
    const team = teams.find((t) => t.id === teamId);

    if (team) {
      // Определяем страну по команде
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

    // const teamList = this.teamsData[countrySlug] || [];
    const client = this.dataprojectApiService.getClient(countrySlug);
    const teamList = await client.getAllTeams();
    const keyboard = teamList.map((team) => [
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

    const monitoredPlayers =
      this.monitoredPlayers[chatId]?.[countrySlug]?.[teamId] || [];

    const keyboard = players.map((player) => [
      {
        text: `${monitoredPlayers.includes(player.id) ? '✅' : '❌'} #${player.number} ${player.fullName}`,
        callback_data: `toggle_player:${countrySlug}:${teamId}:${player.id}`,
      },
    ]);

    if (monitoredPlayers.length > 0) {
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

    // Проходим по всем странам и командам
    for (const [citySlug, teams] of Object.entries(monitored)) {
      // Получаем все команды для данного города
      const teamList = await this.dataprojectApiService
        .getClient(citySlug as CountrySlug)
        .getAllTeams();

      // Проходим по всем командам, которые находятся под мониторингом
      for (const [teamId, playerIds] of Object.entries(teams)) {
        const team = teamList.find((t) => t.id === parseInt(teamId));
        const country = countries.find((c) => c.slug === citySlug);

        if (!team || !country) continue;

        const teamRoster = await this.dataprojectApiService
          .getClient(citySlug as CountrySlug)
          .getTeamRoster(+teamId);

        const players = teamRoster.filter((p) => playerIds.includes(p.id));

        message += `*${country.emoji} ${country.name} - ${team.name}:*\n`;
        message += players
          .map((p) => `• #${p.number} ${p.fullName}`)
          .join('\n');
        message += '\n\n';
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

    this.telegramBot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard },
    });
  }
}
