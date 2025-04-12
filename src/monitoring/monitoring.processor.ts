import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { DataprojectApiService } from '../providers/dataproject/dataproject-api.service';
import { Logger } from '@nestjs/common';
import { CountryInfo, CountrySlug } from '../providers/dataproject/types';
import { MONITOR_QUEUE } from '../providers/dataproject/monitor.consts';
import { MonitoringService } from './monitoring.service';

@Processor(MONITOR_QUEUE)
export class MonitoringProcessor {
  constructor(
    private readonly dataprojectApiService: DataprojectApiService,
    private readonly monitoringService: MonitoringService,
  ) {}

  @Process('monitor-country')
  async handleCountry(job: Job<{ country: CountryInfo }>) {
    const { slug, name } = job.data.country;
    try {
      const client = this.dataprojectApiService.getClient(slug);
      const matches = await client.getMatchesInfo();

      const now = new Date();
      const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

      const upcomingMatches = matches.filter(
        (match) =>
          match.matchDateTimeUtc &&
          match.matchDateTimeUtc > now &&
          match.matchDateTimeUtc <= oneHourLater,
      );

      Logger.debug(`${name}: Матчей в течении часа: ${upcomingMatches.length}`);
    } catch (err) {
      Logger.error(`Ошибка при обработке ${slug}: ${err.message}`);
    }
  }
}
