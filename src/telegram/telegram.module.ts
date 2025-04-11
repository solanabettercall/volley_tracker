import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { DataprojectModule } from 'src/providers/dataproject/dataproject.module';
import { MongooseModule } from '@nestjs/mongoose';
import { MonitoredTeamSchema } from 'src/schemas/monitoring.schema';

@Module({
  imports: [
    DataprojectModule,
    MongooseModule.forFeature([
      { name: 'MonitoredTeam', schema: MonitoredTeamSchema },
    ]),
  ],
  providers: [TelegramService],
})
export class TelegramModule {}
