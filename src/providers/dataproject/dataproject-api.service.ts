import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnApplicationBootstrap,
  OnModuleInit,
} from '@nestjs/common';
import * as moment from 'moment';
import * as cheerio from 'cheerio';
import { AxiosRequestConfig } from 'axios';
import { appConfig } from 'src/config';
import Redis from 'ioredis';
import { MatchInfo } from './interfaces/match-info.interface';
import { PlayerInfo } from './interfaces/player-info.interface';
import { federations, FederationInfo, FederationSlug } from './types';
import { TeamInfo } from './interfaces/team-info.interface';
import { PlayerPosition } from './enums';

type RawMatch = {
  id: number;
  competition: ICompetition;
  matchDateTimeUtc: Date;
};

interface IPlayerStatistic {
  id: number;
  totalPoints: number;
  playedSetsCount: number;
  teamId: number;
  competitionId: number;
}

export interface ICompetition {
  id: number;
  fullName: string;
  name: string;
}

export class PlayerStatistic implements IPlayerStatistic {
  constructor(dto: IPlayerStatistic) {
    Object.assign(this, dto);
  }

  id: number;
  totalPoints: number;
  playedSetsCount: number;
  teamId: number;
  competitionId: number;

  get rating(): number {
    return this.playedSetsCount > 0
      ? this.totalPoints / this.playedSetsCount
      : 0;
  }
}

class DataprojectFederationClient {
  constructor(
    private readonly httpService: HttpService,
    public readonly federation: FederationInfo,
  ) {}

  private connectionToken: string = null;

  protected async getPlayersStatistic(): Promise<PlayerStatistic[]> {
    const allStats: PlayerStatistic[] = [];

    // Генератор для обхода всех competitionId
    async function* statsGenerator(this: DataprojectFederationClient) {
      const competitionIds = this.federation.competitionIds;

      if (!competitionIds?.length) return;

      for (const competitionId of competitionIds) {
        try {
          const stats =
            await this.getPlayersStatisticByCompetition(competitionId);
          for (const stat of stats) {
            yield stat;
          }
        } catch (e) {
          Logger.warn(
            `Ошибка при получении статистики по competitionId=${competitionId}`,
            e,
          );
        }
      }
    }

    for await (const stat of statsGenerator.call(this)) {
      allStats.push(stat);
    }

    return allStats;
  }

  protected async getPlayersCount(competitionId: number): Promise<number> {
    const payload = {
      filterExpressions: [],
      compID: competitionId,
      phaseID: 0,
      playerSearchByName: '',
    };

    const config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: `https://${this.federation.slug}-web.dataproject.com/Statistics_AllPlayers.aspx/GetCount`,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:138.0) Gecko/20100101 Firefox/138.0',
        Accept: '*/*',
        'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3',
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/json; charset=utf-8',
        Origin: `https://${this.federation.slug}-web.dataproject.com`,
        DNT: '1',
        'Sec-GPC': '1',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
      },
      data: payload,
    };

    const { data } = await this.httpService.axiosRef.request(config);

    const count = data?.d ?? 0;
    return count;
  }

  protected async getPlayersStatisticByCompetition(
    competitionId: number,
  ): Promise<PlayerStatistic[]> {
    const maximumRows = await this.getPlayersCount(competitionId);

    const payload = {
      startIndex: 0,
      maximumRows: maximumRows,
      sortExpressions: '',
      filterExpressions: [],
      compID: competitionId,
      phaseID: 0,
      playerSearchByName: '',
    };
    let config = {
      method: 'post',
      url: `https://${this.federation.slug}-web.dataproject.com/Statistics_AllPlayers.aspx/GetData`,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:138.0) Gecko/20100101 Firefox/138.0',
        Accept: '*/*',
        'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3',
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/json; charset=utf-8',
        Origin: `https://${this.federation.slug}-web.dataproject.com`,
        DNT: '1',
        'Sec-GPC': '1',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
      },
      data: payload,
    };

    type RawPartialPlayerStatistic = {
      PlayerID: number;
      PointsTot_ForAllPlayerStats: number;
      PlayedSets: number;
      TeamID: number;
    };
    const { data } = await this.httpService.axiosRef.request<{
      d: RawPartialPlayerStatistic[];
    }>(config);

    if (!data?.d) {
      return [];
    }
    return data.d.map(
      (d) =>
        new PlayerStatistic({
          id: d.PlayerID,
          competitionId: competitionId,
          playedSetsCount: d.PlayedSets,
          totalPoints: d.PointsTot_ForAllPlayerStats,
          teamId: d.TeamID,
        }),
    );
  }

  protected async getAllTeams(): Promise<Pick<TeamInfo, 'id' | 'name'>[]> {
    const allTeams: Pick<TeamInfo, 'id' | 'name'>[] = [];
    const uniqueTeamIds = new Set<number>();

    try {
      // TODO рефакторинг
      if (!this.federation.competitionIds.length) {
        const competitionTeams = await this.getTeams();
        for (const team of competitionTeams) {
          if (!uniqueTeamIds.has(team.id)) {
            uniqueTeamIds.add(team.id);
            allTeams.push(team);
          }
        }
      }

      for (const competitionId of this.federation.competitionIds) {
        const competitionTeams = await this.getTeams(competitionId);

        for (const team of competitionTeams) {
          if (!uniqueTeamIds.has(team.id)) {
            uniqueTeamIds.add(team.id);
            allTeams.push(team);
          }
        }
      }
    } catch (e) {
      Logger.error(
        `Ошибка при получении всех команд для ${this.federation.slug}:`,
        e,
      );
      throw e; // Можно заменить на return allTeams; если нужно продолжить при ошибках
    }

    return allTeams;
  }

  protected async getTeams(
    competitionId?: number,
  ): Promise<Pick<TeamInfo, 'id' | 'name'>[]> {
    //Logger.debug('getAllTeams');
    const url = `https://${this.federation.slug}-web.dataproject.com/CompetitionTeamSearch.aspx`;
    type RawTeam = Pick<TeamInfo, 'id' | 'name'>;
    const teams: RawTeam[] = [];
    try {
      const params = competitionId ? { ID: competitionId } : {};

      const response = await this.httpService.axiosRef.get(url, {
        headers: {
          Host: `${this.federation.slug}-web.dataproject.com`,
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:138.0) Gecko/20100101 Firefox/138.0',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'same-origin',
          Priority: 'u=0, i',
        },
        params,
      });
      const $ = cheerio.load(response.data);
      let competition = $('div#LYR_Menu h2.CompetitionDescription_Header')
        .text()
        .trim();
      if (!competition) {
        competition = $('h2.CompetitionDescription_Header').text().trim();
      }

      $('div.RadAjaxPanel div.rlvI[onclick]').each((_, element) => {
        const onclick = $(element).attr('onclick') ?? '';
        const teamName = $(element).find('h4').text().trim();
        const match = onclick.match(/TeamID=(\d+)/);
        const teamId = match ? Number(match[1]) : 0;

        teams.push({
          id: teamId,
          name: teamName,
        });
      });
    } catch (e) {
      Logger.error('Ошибка при получении всех команд федерации:', e);
    }

    return teams;
  }

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
          Origin: `https://${this.federation.slug}-web.dataproject.com`,
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

  public async getCompetitions(): Promise<ICompetition[]> {
    const { data } = await this.httpService.axiosRef.get(
      `https://${this.federation.slug}-web.dataproject.com/MainHome.aspx`,
      {},
    );

    const $ = cheerio.load(data);

    let rawCompetitions: Pick<ICompetition, 'id' | 'name'>[] = $(
      'li a[id^="C_"]',
    )
      .map((_, el) => {
        const id = parseInt($(el).attr('id').replace('C_', ''), 10);
        const name = $(el).text().trim();
        return { id, name };
      })
      .toArray();

    if (!rawCompetitions.length) {
      rawCompetitions = $(
        'input[id^="Content_Main_RP_Competitions_HF_CompetitionID"]',
      )
        .map((_, el) => {
          const id = parseInt($(el).attr('value').trim());
          const name = $(el)
            .parent()
            .find(
              'span[id^="Content_Main_RP_Competitions_LBL_CompetitionDescription"]',
            )
            .text()
            .trim();
          return { id, name };
        })
        .toArray();
    }

    const uniqueCompetitions = Array.from(
      new Map(rawCompetitions.map((comp) => [comp.id, comp])).values(),
    ).filter((c) => this.federation.competitionIds.includes(c.id));

    const competitions: ICompetition[] = [];
    for (const { id } of uniqueCompetitions) {
      const competition = await this.getFullCompetitionById(id);
      competitions.push(competition);
    }

    return competitions;
  }

  // protected async getCompetitions(): Promise<ICompetition[]> {
  //   const competitions = await this.getAllCompetitions();
  //   return competitions.filter((c) =>
  //     this.federation.competitionIds.includes(c.id),
  //   );
  // }

  protected async getCompetitionById(id: number): Promise<ICompetition | null> {
    if (!id) return null;
    const competitions = await this.getCompetitions();
    return competitions.find((c) => c.id === id);
  }

  private async getFullCompetitionById(
    id: number,
  ): Promise<ICompetition | null> {
    const { data } = await this.httpService.axiosRef.get(
      `https://${this.federation.slug}-web.dataproject.com/CompetitionHome.aspx`,
      {
        params: {
          ID: id,
        },
      },
    );

    const $ = cheerio.load(data);

    const name = $('div#LYR_Menu h2').text().trim();
    const fullName = $('div#LYR_CompetitionDescription h2').text().trim();

    return {
      id,
      name,
      fullName,
    };
  }

  protected async getRawMatchs(): Promise<RawMatch[]> {
    const url = `https://${this.federation.slug}-web.dataproject.com/MainLiveScore.aspx`;
    const matches: RawMatch[] = [];

    try {
      const response = await this.httpService.axiosRef.get(url, {
        headers: {
          Cookie: 'timezoneoffset=0',
        },
      });

      const $ = cheerio.load(response.data);
      const matchElements = $('div.match-main-wrapper').toArray();

      for (const element of matchElements) {
        const time = $(element)
          .find('span[id^="Content_Main_RLV_MatchList_LB_Ora_Today_"]')
          .text()
          .trim()
          .replace('.', ':');

        const onclickAttr = $(element)
          .find(
            'div[id^="Content_Main_RLV_MatchList_DIV_MatchListLive_Result"]',
          )
          .attr('onclick');

        const competitionId = onclickAttr?.match(/&ID=(\d+)/)?.[1]
          ? parseInt(onclickAttr.match(/&ID=(\d+)/)![1], 10)
          : null;

        const [utcHourStr, utcMinuteStr] = time.split(':');
        const utcHour = parseInt(utcHourStr, 10);
        const utcMinute = parseInt(utcMinuteStr, 10);

        if (isNaN(utcHour) || isNaN(utcMinute)) {
          Logger.warn(`Невалидное время матча: "${time}"`);
          continue;
        }

        const matchDateTimeUtc = moment
          .utc()
          .set({ hour: utcHour, minute: utcMinute, second: 0, millisecond: 0 })
          .toDate();

        const matchId = $(element).attr('id')?.split('Match_Main_')[1]?.trim();

        if (!matchId || !competitionId) continue;

        const competition = await this.getCompetitionById(competitionId);
        if (competition) {
          matches.push({
            id: +matchId,
            competition,
            matchDateTimeUtc,
          });
        }
      }
    } catch (e) {
      Logger.error('Error fetching live matches:', e);
    }

    return matches;
  }

  protected async getMatchesInfo(rawMatches: RawMatch[]): Promise<MatchInfo[]> {
    // Logger.debug('getMatchesInfo');

    const connectionToken = await this.ensureConnectionToken();
    const matchIds = rawMatches.map((m) => m.id);

    const teamsMap = new Map(
      rawMatches.map((m) => [
        m.id,
        {
          competition: m.competition,
          matchDateTimeUtc: m.matchDateTimeUtc,
        },
      ]),
    );

    if (!matchIds.length) return [];
    const requestData = {
      H: 'signalrlivehubfederations',
      M: 'getLiveScoreListData_From_ES',
      A: [matchIds.join(';'), this.federation.slug],
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
        Origin: `https://${this.federation.slug}-web.dataproject.com`,
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
          matchDateTimeUtc: teamsMap.get(id)?.matchDateTimeUtc ?? new Date(),

          home: {
            id: r.Home,
            name: r.HomeEmpty,
            players: await this.getTeamPlayersFromMatch(
              r.ChampionshipMatchID,
              r.Home,
              teamsMap.get(id).competition.id,
            ),
          },
          guest: {
            id: r.Guest,
            name: r.GuestEmpty,
            players: await this.getTeamPlayersFromMatch(
              r.ChampionshipMatchID,
              r.Guest,
              teamsMap.get(id).competition.id,
            ),
          },
          competition: teamsMap.get(id).competition,
        };

        return match;
      }),
    );

    const updatedMatches = await Promise.all(
      matches.map(async (match) => {
        const activePlayers = await this.getMatchActivePlayers(match.id);

        if (activePlayers.length !== 12) return match;

        const setIsActive = (
          players: PlayerInfo[],
          isHome: boolean,
        ): PlayerInfo[] =>
          players.map((p) => ({
            ...p,
            isActive: activePlayers.some(
              (a) =>
                a.id === p.id && a.isHome === isHome && a.number === p.number,
            ),
          }));

        return {
          ...match,
          home: {
            ...match.home,
            players: setIsActive(match.home.players, true),
          },
          guest: {
            ...match.guest,
            players: setIsActive(match.guest.players, false),
          },
        };
      }),
    );

    return updatedMatches;
  }

  protected async getTeamPlayersFromMatch(
    matchId: number,
    teamId: number,
    competitionId: number,
  ): Promise<PlayerInfo[]> {
    // Logger.debug('getTeamPlayersFromMatch');

    const requestData = `data={"H":"signalrlivehubfederations","M":"getRosterData","A":["${matchId}",${teamId},"${this.federation.slug}"],"I":0}`;

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
        Origin: `https://${this.federation.slug}-web.dataproject.com`,
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

    const teamRoster: PlayerInfo[] = await this.getTeamRoster(
      teamId,
      competitionId,
    );

    const players: PlayerInfo[] = data.R.map((r) => {
      const basePlayer = {
        id: r.PID,
        number: r.N,
        fullName: `${r.SR} ${r.NM}`,
      };

      const extraInfo = teamRoster.find((p) => p.id === r.PID);
      return Object.assign(basePlayer, extraInfo);
    });
    return players;
  }

  private parsePlayerPosition(text: string): PlayerPosition | null {
    if (!text) return null;
    const textPosition = text.toLowerCase();
    switch (textPosition) {
      case 'libero':
        return PlayerPosition.L;
      case 'middle-blocker':
      case 'middle blocker':
        return PlayerPosition.MB;
      case 'opposite':
        return PlayerPosition.O;
      case 'setter':
        return PlayerPosition.S;
      case 'wing-spiker':
      case 'wing spiker':
        return PlayerPosition.WS;
      case 'universal':
        return PlayerPosition.U;
      case '-':
        return null;

      default: {
        Logger.warn(`Неизвестная позиция: ${textPosition}`);
        return null;
      }
    }
  }

  protected async getTeamRoster(teamId: number, competitionId: number) {
    // Logger.debug('getTeamRoster');

    const url = `https://${this.federation.slug}-web.dataproject.com/CompetitionTeamDetails.aspx`;
    const headers = {
      Host: `${this.federation.slug}-web.dataproject.com`,
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
      Cookie: `CompetitionLangCode${this.federation.slug}=en-GB`,
    };

    try {
      const { data: html } = await this.httpService.axiosRef.get(url, {
        headers,
        params: {
          ID: competitionId,
          TeamID: teamId,
        },
      });
      const $ = cheerio.load(html);
      const rosterDiv = $('#Content_Main_RPL_Roster');

      const players: PlayerInfo[] = [];

      rosterDiv
        .find('div[id^="ctl00_Content_Main_PlayerListView_ctrl"][onclick]')
        .each((_, el) => {
          const element = $(el);
          const cols = element.find('div.t-row div.t-col').eq(5);

          const positionText = $(cols).text().trim();
          const position = this.parsePlayerPosition(positionText);

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
              position,
            });
          }
        });
      return players;
    } catch (error) {
      Logger.error('Ошибка при получении состава команды:', error);
      return [];
    }
  }

  protected async getMatchActivePlayers(
    matchId: number,
  ): Promise<{ id: number; number: number; isHome: boolean }[]> {
    const connectionToken = await this.ensureConnectionToken();

    const payload = `data={"H":"signalrlivehubfederations","M":"getLineUpData","A":["${matchId}","${this.federation.slug}"],"I":0}`;

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
        Origin: `https://${this.federation.slug}-web.dataproject.com`,
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

    return data.R.filter((d) => d.PN || d.PID).map((R) => ({
      id: R.PID,
      number: R.PN,
      isHome: R.HG,
    }));
  }

  protected async getPlayerStatistic(
    playerId: number,
    teamId: number,
    competitionId: number,
  ): Promise<PlayerStatistic | null> {
    const allStats = await this.getPlayersStatisticByCompetition(competitionId);

    let matchingStats = allStats.filter(
      (stat) => stat.id === playerId && stat.teamId === teamId,
    );

    if (matchingStats.length === 0) {
      matchingStats = allStats.filter((stat) => stat.id === playerId);
    }

    if (matchingStats.length === 0) {
      return null;
    }

    const bestStat = matchingStats.reduce((prev, current) =>
      current.playedSetsCount > prev.playedSetsCount ? current : prev,
    );

    return new PlayerStatistic(bestStat);
  }
}

export class DataprojectFederationCacheClient extends DataprojectFederationClient {
  constructor(httpService: HttpService, federation: FederationInfo) {
    super(httpService, federation);
  }

  private readonly redis = new Redis({
    host: appConfig.redis.host,
    port: appConfig.redis.port,
  });

  private readonly defaultTtl = appConfig.redis.defaultTtl; // в секундах

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
    const key = `federation:${this.federation.slug}:matchIds`;
    return this.getOrSetCache(key, () => super.getRawMatchs());
    // return super.getRawMatchs();
  }

  public override async getMatchesInfo(): Promise<MatchInfo[]> {
    const matchIds = await this.getRawMatchs();
    const key = `federation:${this.federation.slug}:matchesInfo:${matchIds.sort().join(',')}`;
    return this.getOrSetCache(key, () => super.getMatchesInfo(matchIds), 30);

    // return super.getMatchesInfo(matchIds);
  }

  protected override getTeamPlayersFromMatch(
    matchId: number,
    teamId: number,
    competitionId: number,
  ): Promise<PlayerInfo[]> {
    const key = `federation:${this.federation.slug}:playersFromMatch:${competitionId}:${matchId}:${teamId}`;
    return this.getOrSetCache(
      key,
      () => super.getTeamPlayersFromMatch(matchId, teamId, competitionId),
      10,
    );
  }

  public override getTeamRoster(
    teamId: number,
    competitionId: number,
  ): Promise<PlayerInfo[]> {
    const key = `federation:${this.federation.slug}:${competitionId}:teamRoster:${teamId}`;
    return this.getOrSetCache(key, () =>
      super.getTeamRoster(teamId, competitionId),
    );
    // return super.getTeamRoster(teamId, competitionId);
  }

  public override getTeams(
    competitionId: number,
  ): Promise<Pick<TeamInfo, 'id' | 'name'>[]> {
    const key = `federation:${this.federation.slug}:teams:${competitionId}`;
    return this.getOrSetCache(key, () => super.getTeams(competitionId));
    // return super.getTeams(competitionId);
  }

  public override getAllTeams(): Promise<Pick<TeamInfo, 'id' | 'name'>[]> {
    const key = `federation:${this.federation.slug}:allTeams`;
    return this.getOrSetCache(key, () => super.getAllTeams());
    // return super.getAllTeams();
  }

  protected override getPlayersCount(competitionId: number): Promise<any> {
    const key = `federation:${this.federation.slug}:${competitionId}:playersCount`;
    return this.getOrSetCache(key, () => super.getPlayersCount(competitionId));
    // return super.getPlayersCount(competitionId);
  }

  protected override getPlayersStatisticByCompetition(
    competitionId: number,
  ): Promise<PlayerStatistic[]> {
    const key = `federation:${this.federation.slug}:${competitionId}:playersStatisticByCompetition`;
    return this.getOrSetCache(
      key,
      () => super.getPlayersStatisticByCompetition(competitionId),
      3600,
    );
    // return super.getPlayersStatisticByCompetition(competitionId);
  }

  protected override getPlayersStatistic(): Promise<PlayerStatistic[]> {
    const key = `federation:${this.federation.slug}:playersStatistic`;
    return this.getOrSetCache(key, () => super.getPlayersStatistic(), 3600);
    // return super.getPlayersStatistic();
  }

  public override async getPlayerStatistic(
    playerId: number,
    teamId: number,
    competitionId: number,
  ): Promise<PlayerStatistic | null> {
    const key = `federation:${this.federation.slug}:${competitionId}:team:${teamId}:playerStatistic:${playerId}`;
    const result = await this.getOrSetCache(
      key,
      () => super.getPlayerStatistic(playerId, teamId, competitionId),
      3600,
    );

    if (!result) {
      return null;
    }

    return new PlayerStatistic(result);

    // return super.getPlayerStatistic(playerId, teamId);
  }

  public override async getCompetitions(): Promise<ICompetition[]> {
    const key = `federation:${this.federation.slug}:competitions`;
    return this.getOrSetCache(key, () => super.getCompetitions(), 3600 * 12);
    // return super.getCompetitions();
  }

  public override async getCompetitionById(id: number): Promise<ICompetition> {
    const key = `federation:${this.federation.slug}:competition:${id}`;
    return this.getOrSetCache(
      key,
      () => super.getCompetitionById(id),
      3600 * 12,
    );
    // return super.getCompetitionById(id);
  }
}

@Injectable()
export class DataprojectApiService {
  private clients: Map<string, DataprojectFederationCacheClient> = new Map();

  constructor(private readonly httpService: HttpService) {}
  // async onApplicationBootstrap() {
  //   const competitions = await this.getClient('cvf').getCompetitions();
  //   console.log(competitions);
  // }

  getClient(federation: FederationInfo): DataprojectFederationCacheClient;
  getClient(federationSlug: FederationSlug): DataprojectFederationCacheClient;

  getClient(
    input: FederationInfo | FederationSlug,
  ): DataprojectFederationCacheClient {
    const federationSlug = typeof input === 'string' ? input : input.slug;
    let federation: FederationInfo | undefined;

    if (typeof input === 'string') {
      federation = federations.find((c) => c.slug === input);
      if (!federation) {
        throw new BadRequestException(`Федерации ${input} не существует`);
      }
    } else {
      federation = input;
    }

    if (!this.clients.has(federationSlug)) {
      const client = new DataprojectFederationCacheClient(
        this.httpService,
        federation,
      );
      this.clients.set(federationSlug, client);
      return client;
    }

    return this.clients.get(federationSlug)!;
  }
}
