import { Module } from '@nestjs/common';
import { MonitoringService } from './monitoring.service';
import { DataprojectModule } from 'src/providers/dataproject/dataproject.module';
import { MongooseModule } from '@nestjs/mongoose';
import { MonitoredTeamSchema } from 'src/schemas/monitoring.schema';
import { BullModule } from '@nestjs/bull/dist/bull.module';
import { MONITOR_QUEUE } from 'src/providers/dataproject/monitor.consts';
import { MonitoringProcessor } from './monitoring.processor';
import { MonitoringCronService } from './monitoring-cron.service';
import { NOTIFY_QUEUE } from 'src/notifications/notify.const';
import { NotifyModule } from 'src/notifications/notify.module';

@Module({
  imports: [
    DataprojectModule,
    NotifyModule,
    MongooseModule.forFeature([
      { name: 'MonitoredTeam', schema: MonitoredTeamSchema },
    ]),
    BullModule.registerQueue({ name: MONITOR_QUEUE }),
    BullModule.registerQueue({ name: NOTIFY_QUEUE }),
  ],
  providers: [MonitoringService, MonitoringProcessor, MonitoringCronService],
  exports: [MonitoringService],
})
export class MonitoringModule {}
