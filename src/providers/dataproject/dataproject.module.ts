import { Module } from '@nestjs/common';
import { DataprojectApiService } from './dataproject-api.service';
import { DataprojectController } from './dataproject.controller';
import { HttpModule } from '@nestjs/axios';
import { DataprojectMonitorService } from './dataproject.service';
import { DataprojectMonitorProcessor } from './dataproject-monitor.processor';
import { BullModule } from '@nestjs/bull';
import { MONITOR_QUEUE } from './monitor.consts';

@Module({
  imports: [
    HttpModule.register({
      proxy: {
        host: '172.26.208.1',
        port: 8888,
        protocol: 'http',
      },
    }),
    BullModule.registerQueue({ name: MONITOR_QUEUE }),
  ],
  providers: [
    DataprojectApiService,
    DataprojectMonitorService,
    DataprojectMonitorProcessor,
  ],
  controllers: [DataprojectController],
})
export class DataprojectModule {}
