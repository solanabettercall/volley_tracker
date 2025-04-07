import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataprojectApiService } from './dataproject-api.service';

@Injectable()
export class DataprojectCacheService implements OnApplicationBootstrap {
  constructor(private readonly dataprojectApiService: DataprojectApiService) {}

  async onApplicationBootstrap() {
    const lnv = this.dataprojectApiService.getClient('lnv');

    const matchIds = await lnv.getMatchIds();
    console.log(matchIds);
    const matchesInfo = await lnv.getMatchesInfo(matchIds);
    console.log(matchesInfo);
    if (!matchesInfo.length) {
      Logger.debug(`Матчей в ${lnv.countrySlug} не запланировано`);
      return;
    }

    // console.log(JSON.stringify(matchesInfo, null, 2));
    // console.log(matchesInfo[0].home.players);
    // const players = await lnv.getTeamRoster(911);
    // console.log(players);
  }
}
