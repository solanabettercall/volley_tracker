import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { DataprojectApiService } from './dataproject-api.service';
import { Logger } from '@nestjs/common';
import { CountrySlug } from './types';
import { MONITOR_QUEUE } from './monitor.consts';

@Processor(MONITOR_QUEUE)
export class DataprojectMonitorProcessor {
  constructor(private readonly dataprojectApiService: DataprojectApiService) {}

  @Process('monitor-country')
  async handleCountry(job: Job<{ slug: CountrySlug }>) {
    const { slug } = job.data;
    try {
      const client = this.dataprojectApiService.getClient(slug);
      const matches = await client.getMatchesInfo();

      Logger.debug(`Slug: ${slug}, Matches: ${matches.length}`);
      // тут делай что нужно с матчами
    } catch (err) {
      Logger.error(`Ошибка при обработке ${slug}: ${err.message}`);
    }
  }
}
