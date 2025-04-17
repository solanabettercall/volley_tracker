import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Queue } from 'bull';
import { DataprojectApiService } from 'src/providers/dataproject/dataproject-api.service';
import { MONITOR_QUEUE } from 'src/providers/dataproject/monitor.consts';
import { federations } from 'src/providers/dataproject/types';

@Injectable()
export class MonitoringCronService implements OnApplicationBootstrap {
  constructor(@InjectQueue(MONITOR_QUEUE) private monitorQueue: Queue) {}

  async onApplicationBootstrap() {
    Logger.debug(this.constructor.name);

    // console.log(teams);
    await this.enqueueAllCountries();
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async enqueueAllCountries() {
    for (const federation of federations) {
      await this.monitorQueue.add(
        'monitor-federation',
        { federation },
        {
          jobId: federation.slug,
          removeOnComplete: true,
        },
      );
    }
  }
}
