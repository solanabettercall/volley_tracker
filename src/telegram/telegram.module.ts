import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { DataprojectModule } from 'src/providers/dataproject/dataproject.module';
import { MongooseModule } from '@nestjs/mongoose';
import { MonitoredTeamSchema } from 'src/schemas/monitoring.schema';
import { MonitoringModule } from 'src/monitoring/monitoring.module';

@Module({
  imports: [DataprojectModule, MonitoringModule],
  providers: [TelegramService],
})
export class TelegramModule {}
