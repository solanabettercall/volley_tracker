import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  Logger,
  NotImplementedException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import * as moment from 'moment';
import * as cheerio from 'cheerio';
import * as querystring from 'querystring';
import { AxiosRequestConfig } from 'axios';

interface TeamInfo {
  id: string;
  name: string;
}

enum MatchStatus {
  Scheduled = 0,
  Live = 1,
  Finished = 2,
}

interface MatchInfo {
  id: string;
  status: MatchStatus;
  home: TeamInfo;
  guest: TeamInfo;
}

interface PlayerInfo {
  id: number;
  name: string;
  surname: string;
}

@Injectable()
export class DataprojectService implements OnApplicationBootstrap {
  constructor(private readonly httpService: HttpService) {}
  private readonly countrySlug = 'bevl';

  private connectionToken: string = null;

  private getTimestamp(): number {
    return moment().valueOf();
  }

  async getConnectionToken(): Promise<string> {
    const timestamp = this.getTimestamp();
    try {
      let config = {
        method: 'get',
        maxBodyLength: Infinity,
        url: `https://dataprojectservicesignalr.azurewebsites.net/signalr/negotiate?clientProtocol=2.1&connectionData=[{"name":"signalrlivehubfederations"}]&_=${timestamp}`,
        headers: {
          Accept: 'text/plain, */*; q=0.01',
          'Accept-Language': 'ru,ru-RU;q=0.9,en;q=0.8',
          Connection: 'keep-alive',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Origin: `https://${this.countrySlug}-web.dataproject.com`,
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'cross-site',
          'Sec-Fetch-Storage-Access': 'active',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
          'sec-ch-ua':
            '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
        },
      };

      const response = await this.httpService.axiosRef.request(config);

      const token = response.data.ConnectionToken;
      return token;
    } catch (error) {
      Logger.error('Ошибка при получении токена:', error);
    }
  }

  private async getMatchIds(): Promise<string[]> {
    const url = `https://${this.countrySlug}-web.dataproject.com/MainLiveScore.aspx`;
    const matchIds: string[] = [];

    try {
      const response = await this.httpService.axiosRef.get(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3',
          Connection: 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'same-origin',
        },
      });

      const $ = cheerio.load(response.data);

      $('div.match-main-wrapper').each((index, element) => {
        try {
          const matchId = $(element)
            .attr('id')
            ?.split('Match_Main_')[1]
            ?.trim();
          if (matchId) {
            matchIds.push(matchId);
          }
        } catch (e) {
          console.error('Error parsing match ID:', e);
        }
      });
    } catch (e) {
      console.error('Error fetching live matches:', e);
    }

    return matchIds;
  }

  private async getMatchesInfo(matchIds: string[]): Promise<MatchInfo[]> {
    if (!matchIds.length) return [];
    const requestData = {
      H: 'signalrlivehubfederations',
      M: 'getLiveScoreListData_From_ES',
      A: [matchIds.join(';'), this.countrySlug],
      I: 0,
    };

    let config = {
      method: 'post',
      maxBodyLength: Infinity,
      params: {
        transport: 'serverSentEvents',
        clientProtocol: '2.1',
        connectionToken: this.connectionToken,
        connectionData: '[{"name":"signalrlivehubfederations"}]',
      },
      url: `https://dataprojectservicesignalr.azurewebsites.net/signalr/send`,
      headers: {
        Accept: 'text/plain, */*; q=0.01',
        'Accept-Language': 'ru',
        Connection: 'keep-alive',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Origin: `https://${this.countrySlug}-web.dataproject.com`,
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site',
        'Sec-Fetch-Storage-Access': 'none',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
        'sec-ch-ua':
          '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
      },
      data: `data=${JSON.stringify(requestData)}`,
    };

    const { data } = await this.httpService.axiosRef.request<{
      R: any[];
      I: string;
    }>(config);

    return data.R.map((r) => {
      return {
        id: r.ChampionshipMatchID,
        status: r.Status,
        home: {
          id: r.Home,
          name: r.HomeEmpty,
        },
        guest: {
          id: r.Guest,
          name: r.GuestEmpty,
        },
      };
    });
  }

  private async getTeamPlayersFromMatch(
    matchId: string,
    teamId: string,
  ): Promise<PlayerInfo[]> {
    let requestData = `data={"H":"signalrlivehubfederations","M":"getRosterData","A":["${matchId}",${teamId},"${this.countrySlug}"],"I":2}`;

    // const requestData = {
    //   H: 'signalrlivehubfederations',
    //   M: 'getLiveScoreListData_From_ES',
    //   A: [matchId, teamId, 'frv'],
    //   I: 0,
    // };

    let config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: 'https://dataprojectservicesignalr.azurewebsites.net/signalr/send?transport=serverSentEvents&clientProtocol=2.1&connectionToken=pSNDhK5cwTvqY6ijUZqSfcayri3FEIw8nNZyHQXWKSB4ATYZimg9DBGqMBYoJd9W%2FzC4UfFvjCzOqdPTVM%2BWNaKKF6SL34xBO6q4Zcbv4CqjsPHmUdtNIQrNwDIpOYJJ&connectionData=[{"name":"signalrlivehubfederations"}]',
      headers: {
        Host: 'dataprojectservicesignalradv.azurewebsites.net',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:138.0) Gecko/20100101 Firefox/138.0',
        Accept: 'text/plain, */*; q=0.01',
        'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Origin: 'https://frv-web.dataproject.com',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site',
        Cookie:
          'ARRAffinity=9adcc53f924e9830e358229e9c721b0c58dcfa70b35faff726e55cbaf987ce07; ARRAffinitySameSite=9adcc53f924e9830e358229e9c721b0c58dcfa70b35faff726e55cbaf987ce07',
      },
      data: requestData,
    };

    const { data } = await this.httpService.axiosRef.request<{
      R: any[];
      I: string;
    }>(config);

    return data.R.map((r) => {
      return {
        id: r.PID,
        name: r.NM,
        surname: r.SR,
      };
    });
  }

  async onApplicationBootstrap() {
    this.connectionToken = await this.getConnectionToken();
    const matchIds = await this.getMatchIds();
    const matchesInfo = await this.getMatchesInfo(matchIds);
    console.log(matchesInfo);
    if (!matchesInfo.length) {
      Logger.debug(`Матчей в ${this.countrySlug} не запланировано`);
      return;
    }
    const match = matchesInfo[0];
    const matchId = match.id;
    const homeId = match.home.id;
    const guestId = match.guest.id;

    const home = await this.getTeamPlayersFromMatch(matchId, homeId);
    console.log(home);

    const guest = await this.getTeamPlayersFromMatch(matchId, guestId);
    console.log(guest);
  }
}
