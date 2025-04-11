import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataprojectApiService } from './dataproject-api.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { countries } from './types';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { MONITOR_QUEUE } from './monitor.consts';

@Injectable()
export class DataprojectMonitorService implements OnApplicationBootstrap {
  constructor(
    private readonly dataprojectApiService: DataprojectApiService,
    @InjectQueue(MONITOR_QUEUE) private monitorQueue: Queue,
  ) {}

  async onApplicationBootstrap() {
    // const client = this.dataprojectApiService.getClient('ossrb');
    // const teams = await client.getAllTeams();
    // console.log(teams);
    // console.log(matches);
    // await this.enqueueAllCountries();
  }

  // @Cron(CronExpression.EVERY_10_SECONDS)
  async enqueueAllCountries() {
    for (const { slug } of countries) {
      await this.monitorQueue.add('monitor-country', { slug });
    }
  }
}
