import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DataprojectModule } from './providers/dataproject/dataproject.module';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import { appConfig } from './config';
import { TelegramModule } from './telegram/telegram.module';
import { MongooseModule } from '@nestjs/mongoose';
import { MonitoringModule } from './monitoring/monitoring.module';

@Module({
  imports: [
    DataprojectModule,
    ScheduleModule.forRoot(),
    BullModule.forRoot({
      redis: {
        host: appConfig.redis.host,
        port: appConfig.redis.port,
      },
    }),
    BullModule.registerQueue({
      name: 'federation-monitor',
    }),
    TelegramModule,
    MongooseModule.forRoot(
      `mongodb://${appConfig.db.username}:${appConfig.db.password}@${appConfig.db.host}:${appConfig.db.port}/${appConfig.db.database}?authSource=admin`,
    ),
    MonitoringModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
