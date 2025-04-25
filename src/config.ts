import { ConflictException } from '@nestjs/common';
import { config } from 'dotenv';

config();

interface IRedisConfig {
  defaultTtl: number;
  host: string;
  port: number;
}

interface ITelegramConfig {
  token: string;
  channelId: number | null;
  adminIds: number[];
}

interface IDbConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

interface IAppConfig {
  env: string;
  port: number;
  redis: IRedisConfig;
  db: IDbConfig;
  tg: ITelegramConfig;
}

const parseAdminIds = (raw: string | undefined): number[] => {
  if (!raw) return [];
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) => parseInt(id, 10))
    .filter((id) => !isNaN(id));
};

export const appConfig: IAppConfig = {
  env: process.env.NODE_ENV ?? 'local',
  port: parseInt(process.env.APP_PORT) ?? 3000,
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT) ?? 6379,
    defaultTtl: parseInt(process.env.REDIS_DEFAULT_TTL) ?? 360,
  },
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT, 10) ?? 5432,
    database: process.env.DB_NAME ?? 'voley_tracker_db',
    username: process.env.DB_USER || 'changeme',
    password: process.env.DB_PASSWORD || 'changeme',
  },
  tg: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    channelId: parseInt(process.env.TELEGRAM_NOTIFICATION_CHANNEL_ID) || null,
    adminIds: parseAdminIds(process.env.TELEGRAM_ADMIN_IDS),
  },
};

if (!appConfig.tg?.token) {
  throw new ConflictException('Токен Telegram не задан');
}
