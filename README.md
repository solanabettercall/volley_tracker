# 🏐 Volley Tracker

**Volley Tracker** — это приложение для отслеживания событий волейбольных матчей в реальном времени с уведомлениями в Telegram.  
Использует NestJS, MongoDB, Redis и Telegram Bot API.

---

## 📦 Стек технологий

- **Backend:** [NestJS](https://nestjs.com/)
- **Database:** MongoDB + Redis
- **Notifications:** Telegram Bot API
- **Dockerized:** с помощью `docker-compose`
- **Live Reload (dev-режим):** `docker-compose.override.yml`

---

## ⚙️ Настройка окружения

Создайте файл `.env` в корне проекта:

```dotenv
# App
NODE_ENV=prod
APP_PORT=3000

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_DEFAULT_TTL=360

# MongoDB
DB_HOST=db
DB_PORT=27017
DB_NAME=volley_tracker_db
DB_USER=volley_user
DB_PASSWORD=volley_pass

# PgAdmin (если используется)
PGADMIN_EMAIL=admin@admin.com
PGADMIN_PASSWORD=admin
PGADMIN_PORT=7777

# Telegram
TELEGRAM_BOT_TOKEN=<TELEGRAM_BOT_TOKEN>                     # Получить в @BotFather
TELEGRAM_NOTIFICATION_CHANNEL_ID=-1002561104113             # Получить через web.telegram.org/a
TELEGRAM_ADMIN_ID=1635660561                                # Получить через @userinfobot
```

---

## 🚀 Запуск проекта

### 📦 Production

```bash
docker compose -f docker-compose.yml up --build -d
```

- Контейнеры запускаются в фоне
- Приложение стартует в `prod`-режиме (`node dist/main.js`)
- MongoDB, Redis и mongo-express поднимаются автоматически

### 🧪 Разработка

Для режима разработки с автообновлением кода:

```bash
docker compose -f docker-compose.yml -f docker-compose.override.yml up --build --watch
```

- Используется `start:dev`
- Изменения в `src/` и `test/` автоматически синхронизируются с контейнером

---

## 📬 Telegram-интеграция

- Бот уведомляет об изменениях, событиях матчей и т. д.
- Канал уведомлений задаётся через `TELEGRAM_NOTIFICATION_CHANNEL_ID`
- Можно ограничить доступ к боту только для администратора, указав `TELEGRAM_ADMIN_ID`

---

## 📁 Структура проекта

```bash
.
├── src/                      # Основной код приложения
├── test/                     # Тесты
├── Dockerfile
├── docker-compose.yml
├── docker-compose.override.yml
├── .env
└── README.md
```

---

## 🛠 Полезные команды

```bash
# Остановить все контейнеры
docker compose down

# Пересобрать и перезапустить
docker compose up --build -d

# Логи приложения
docker compose logs -f app
```
