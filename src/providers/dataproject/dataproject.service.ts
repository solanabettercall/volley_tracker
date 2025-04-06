import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as moment from 'moment';

interface PlayerInfo {
  nameId: string;
  name: string;
  name2: string;
  number: string;
}

@Injectable()
export class DataprojectService implements OnApplicationBootstrap {
  constructor(private readonly httpService: HttpService) {}

  private getTimestamp(): number {
    return moment().valueOf();
  }

  async getConnectionToken(domain: string): Promise<string> {
    const timestamp = this.getTimestamp();
    try {
      const url = `https://dataprojectservicesignalradv.azurewebsites.net/signalr/negotiate?clientProtocol=1.5&connectionData=[{"name":"signalrlivehubfederations"}]&_=${timestamp}`;

      const headers = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
        Accept: 'text/plain, */*; q=0.01',
        'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Origin: `https://${domain}`,
        Connection: 'keep-alive',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site',
      };

      const response = await this.httpService.axiosRef.get(url, { headers });

      const token = response.data.ConnectionToken;
      return token;
    } catch (error) {
      Logger.error('Ошибка при получении токена:', error);
    }
  }

  // TODO исправить нейминг
  async getSostavs(
    token: string,
    domain: string,
    matchId: string,
    teamId: number,
    flTeam: number,
  ): Promise<PlayerInfo[]> {
    const players: PlayerInfo[] = [];

    try {
      const headers = {
        Accept: 'text/plain, */*; q=0.01',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        Connection: 'keep-alive',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Origin: `https://${domain}`,
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      };

      const params = {
        transport: 'serverSentEvents',
        clientProtocol: '1.5',
        connectionToken: token,
        connectionData: '[{"name":"signalrlivehubfederations"}]',
      };

      const domainDot = domain.split('-web.')[0];
      const data = {
        data: `{"H":"signalrlivehubfederations","M":"getRosterData","A":["${matchId}",${teamId},"${domainDot}"],"I":${flTeam}}`,
      };

      const response = await this.httpService.axiosRef.post(
        'https://dataprojectservicesignalradv.azurewebsites.net/signalr/send',
        data,
        { params, headers },
      );

      const rosterData = response.data?.R || [];

      rosterData.forEach((player: any) => {
        players.push({
          nameId: player.PID,
          name: player.SR,
          name2: player.NM,
          number: player.N,
        });
      });
    } catch (error) {
      Logger.error('Ошибка при получении составов:', error);
    }

    return players;
  }

  async onApplicationBootstrap() {
    const domain = 'frv-web.dataproject.com';
    const connectionToken = await this.getConnectionToken(domain);
    const asdsa = await this.getSostavs(connectionToken, domain, '3417', 2, 2);
    Logger.debug(asdsa, 'asdsa');
  }
}
