import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import * as moment from 'moment';
import * as cheerio from 'cheerio';
import { AxiosRequestConfig } from 'axios';
import { appConfig } from 'src/config';
import Redis from 'ioredis';
import { MatchInfo } from './interfaces/match-info.interface';
import { PlayerInfo } from './interfaces/player-info.interface';
import { CountrySlug } from './types';

type RawMatch = {
  id: number;
  competition: string;
  matchDateTimeUtc: Date;
};

class DataprojectCountryClient {
  constructor(
    private readonly httpService: HttpService,
    public readonly countrySlug: string,
  ) {}

  private connectionToken: string = null;

  private getTimestamp(): number {
    return moment().valueOf();
  }

  private async ensureConnectionToken(): Promise<string> {
    if (!this.connectionToken) {
      this.connectionToken = await this.getConnectionToken();
    }
    return this.connectionToken;
  }

  private async getConnectionToken(): Promise<string> {
    const timestamp = this.getTimestamp();
    try {
      const config = {
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

  protected async getRawMatchs(): Promise<RawMatch[]> {
    const url = `https://${this.countrySlug}-web.dataproject.com/MainLiveScore.aspx`;
    const matches: RawMatch[] = [];

    try {
      const response = await this.httpService.axiosRef.get(url, {
        headers: {
          Cookie: 'timezoneoffset=0', // Для получения времени в UTC-0
        },
      });
      const $ = cheerio.load(response.data);

      $('div.match-main-wrapper').each((_, element) => {
        const competition = $(element)
          .find('span[id^="Content_Main_RLV_MatchList_LBL_Competition"]')
          .text()
          .trim();

        const time = $(element)
          .find('span[id^="Content_Main_RLV_MatchList_LB_Ora_Today_"]')
          .text()
          .trim()
          .replace('.', ':');

        const [utcHourStr, utcMinuteStr] = time.split(':');
        const utcHour = parseInt(utcHourStr, 10);
        const utcMinute = parseInt(utcMinuteStr, 10);

        if (isNaN(utcHour) || isNaN(utcMinute)) {
          Logger.warn(`Невалидное время матча: "${time}"`);
          return;
        }
        const matchDateTimeUtc = moment
          .utc()
          .set({ hour: utcHour, minute: utcMinute, second: 0, millisecond: 0 })
          .toDate();

        const matchId = $(element).attr('id')?.split('Match_Main_')[1]?.trim();

        if (matchId && competition) {
          matches.push({ id: +matchId, competition, matchDateTimeUtc });
        }
      });
    } catch (e) {
      console.error('Error fetching live matches:', e);
    }

    return matches;
  }

  protected async getMatchesInfo(rawMatches: RawMatch[]): Promise<MatchInfo[]> {
    const connectionToken = await this.ensureConnectionToken();
    const matchIds = rawMatches.map((m) => m.id);
    const competitionMap = new Map(
      rawMatches.map((m) => [
        m.id,
        { competition: m.competition, matchDateTimeUtc: m.matchDateTimeUtc },
      ]),
    );

    if (!matchIds.length) return [];
    const requestData = {
      H: 'signalrlivehubfederations',
      M: 'getLiveScoreListData_From_ES',
      A: [matchIds.join(';'), this.countrySlug],
      I: 0,
    };

    const config: AxiosRequestConfig = {
      method: 'post',
      maxBodyLength: Infinity,
      params: {
        transport: 'serverSentEvents',
        clientProtocol: '2.1',
        connectionToken,
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

    const matches: MatchInfo[] = await Promise.all(
      data.R.map(async (r) => {
        const id = r.ChampionshipMatchID;
        const match: MatchInfo = {
          id: r.ChampionshipMatchID,
          status: r.Status,
          matchDateTimeUtc:
            competitionMap.get(id)?.matchDateTimeUtc ?? new Date(),

          home: {
            id: r.Home,
            name: r.HomeEmpty,
            players: await this.getTeamPlayersFromMatch(
              r.ChampionshipMatchID,
              r.Home,
            ),
          },
          guest: {
            id: r.Guest,
            name: r.GuestEmpty,
            players: await this.getTeamPlayersFromMatch(
              r.ChampionshipMatchID,
              r.Guest,
            ),
          },
          competition: competitionMap.get(id)?.competition,
        };

        return match;
      }),
    );

    const updatedMatches = await Promise.all(
      matches.map(async (match) => {
        const activePlayerIds = await this.getMatchActivePlayerIds(match.id);
        if (!activePlayerIds.length) return match;

        const setIsActive = (players: PlayerInfo[]): PlayerInfo[] =>
          players.map((p) => ({
            ...p,
            isActive: activePlayerIds.includes(p.id),
          }));

        return {
          ...match,
          home: {
            ...match.home,
            players: setIsActive(match.home.players),
          },
          guest: {
            ...match.guest,
            players: setIsActive(match.guest.players),
          },
        };
      }),
    );

    return updatedMatches;
  }

  protected async getTeamPlayersFromMatch(
    matchId: number,
    teamId: number,
  ): Promise<PlayerInfo[]> {
    const requestData = `data={"H":"signalrlivehubfederations","M":"getRosterData","A":["${matchId}",${teamId},"${this.countrySlug}"],"I":0}`;

    const connectionToken = await this.ensureConnectionToken();

    const config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: `https://dataprojectservicesignalr.azurewebsites.net/signalr/send`,
      params: {
        transport: 'serverSentEvents',
        clientProtocol: '2.1',
        connectionToken,
        connectionData: '[{"name":"signalrlivehubfederations"}]',
      },
      headers: {
        Host: 'dataprojectservicesignalr.azurewebsites.net',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:138.0) Gecko/20100101 Firefox/138.0',
        Accept: 'text/plain, */*; q=0.01',
        'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Origin: `https://${this.countrySlug}-web.dataproject.com`,
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site',
      },
      data: requestData,
    };

    const { data } = await this.httpService.axiosRef.request<{
      R: any[];
      I: string;
    }>(config);

    const players: PlayerInfo[] = data.R.map((r) => {
      return {
        id: r.PID,
        number: r.N,
        fullName: `${r.SR} ${r.NM}`,
      };
    });
    return players;
  }

  protected async getTeamRoster(teamId: number) {
    const url = `https://${this.countrySlug}-web.dataproject.com/CompetitionTeamDetails.aspx?TeamID=${teamId}`;
    const headers = {
      Host: `${this.countrySlug}-web.dataproject.com`,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:138.0) Gecko/20100101 Firefox/138.0',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-User': '?1',
      Priority: 'u=0, i',
    };

    try {
      const { data: html } = await this.httpService.axiosRef.get(url, {
        headers,
      });
      const $ = cheerio.load(html);
      const rosterDiv = $('#Content_Main_RPL_Roster');

      const players: PlayerInfo[] = [];

      rosterDiv
        .find('div[id^="ctl00_Content_Main_PlayerListView_ctrl"][onclick]')
        .each((_, el) => {
          const element = $(el);

          const onclickAttr = element.attr('onclick');
          const playerId = onclickAttr?.split('PlayerID=')[1]?.split('&ID')[0];

          const number = element
            .find('div.t-hidden-xs .DIV_PlayerNumber')
            .text()
            .trim();

          const name = element
            .find('.t-col')
            .eq(4)
            .find('p')
            .first()
            .text()
            .trim();

          if (playerId && number && name) {
            players.push({
              id: +playerId,
              number: +number,
              fullName: name,
            });
          }
        });

      return players;
    } catch (error) {
      console.error('Ошибка при получении состава команды:', error);
      return [];
    }
  }

  protected async getMatchActivePlayerIds(matchId: number): Promise<number[]> {
    const connectionToken = await this.ensureConnectionToken();

    const payload = `data={"H":"signalrlivehubfederations","M":"getLineUpData","A":["${matchId}","${this.countrySlug}"],"I":0}`;

    let config: AxiosRequestConfig = {
      method: 'post',
      maxBodyLength: Infinity,
      url: 'https://dataprojectservicesignalr.azurewebsites.net/signalr/send',

      params: {
        transport: 'serverSentEvents',
        clientProtocol: '2.1',
        connectionToken,
        connectionData: '[{"name":"signalrlivehubfederations"}]',
      },
      headers: {
        Host: 'dataprojectservicesignalr.azurewebsites.net',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:138.0) Gecko/20100101 Firefox/138.0',
        Accept: 'text/plain, */*; q=0.01',
        'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Origin: `https://${this.countrySlug}-web.dataproject.com`,
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site',
      },
      data: payload,
    };

    type PlayerLineUpInfo = {
      PN: number;
      PZ: number;
      PID: number;
      HG: boolean;
      L: boolean;
      WHG: boolean;
    };

    const { data } = await this.httpService.axiosRef.request<{
      R: PlayerLineUpInfo[];
      I: string;
    }>(config);

    return data.R.map((R) => R.PID);
  }
}

export class DataprojectCountryCacheClient extends DataprojectCountryClient {
  constructor(httpService: HttpService, countrySlug: string) {
    super(httpService, countrySlug);
  }

  private readonly redis = new Redis({
    host: appConfig.redis.host,
    port: appConfig.redis.port,
  });

  private readonly defaultTtl = 120; // в секундах

  private async getOrSetCache<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl = this.defaultTtl,
  ): Promise<T> {
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached);

    const fresh = await fetcher();
    await this.redis.set(key, JSON.stringify(fresh), 'EX', ttl);
    return fresh;
  }

  protected override getRawMatchs(): Promise<RawMatch[]> {
    // const key = `country:${this.countrySlug}:matchIds`;
    // return this.getOrSetCache(key, () => super.getMatchIds());
    return super.getRawMatchs();
  }

  public override async getMatchesInfo(): Promise<MatchInfo[]> {
    const matchIds = await this.getRawMatchs();
    // const key = `country:${this.countrySlug}:matchesInfo:${matchIds.sort().join(',')}`;
    // return this.getOrSetCache(key, () => super.getMatchesInfo(matchIds));

    return super.getMatchesInfo(matchIds);
  }

  protected override getTeamPlayersFromMatch(
    matchId: number,
    teamId: number,
  ): Promise<PlayerInfo[]> {
    const key = `country:${this.countrySlug}:playersFromMatch:${matchId}:${teamId}`;
    return this.getOrSetCache(key, () =>
      super.getTeamPlayersFromMatch(matchId, teamId),
    );
  }

  public override getTeamRoster(teamId: number): Promise<PlayerInfo[]> {
    const key = `country:${this.countrySlug}:teamRoster:${teamId}`;
    return this.getOrSetCache(key, () => super.getTeamRoster(teamId));
  }
}

@Injectable()
export class DataprojectApiService {
  private clients: Map<string, DataprojectCountryCacheClient> = new Map();

  constructor(private readonly httpService: HttpService) {}

  getClient(countrySlug: CountrySlug): DataprojectCountryCacheClient {
    if (!this.clients.has(countrySlug)) {
      this.clients.set(
        countrySlug,
        new DataprojectCountryCacheClient(this.httpService, countrySlug),
      );
    }
    return this.clients.get(countrySlug);
  }
}
