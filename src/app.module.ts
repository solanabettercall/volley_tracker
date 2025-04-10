import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DataprojectModule } from './providers/dataproject/dataproject.module';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import { appConfig } from './config';
import { TelegramModule } from './telegram/telegram.module';

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
      name: 'country-monitor',
    }),
    TelegramModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
