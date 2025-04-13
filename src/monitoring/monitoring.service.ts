import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MonitoredTeam } from 'src/schemas/monitoring.schema';

@Injectable()
export class MonitoringService implements OnApplicationBootstrap {
  constructor(
    @InjectModel('MonitoredTeam')
    private readonly monitoredTeamModel: Model<MonitoredTeam>,
  ) {}
  async onApplicationBootstrap() {
    // await this.monitoredTeamModel.deleteMany({ userId: 1635660561 });
  }

  async addPlayerToMonitoring(
    userId: number,
    countrySlug: string,
    teamId: number,
    playerId: number,
  ): Promise<void> {
    await this.monitoredTeamModel.findOneAndUpdate(
      { userId, countrySlug, teamId },
      { $addToSet: { players: playerId } },
      { upsert: true, new: true },
    );
  }

  async removePlayerFromMonitoring(
    userId: number,
    countrySlug: string,
    teamId: number,
    playerId: number,
  ): Promise<void> {
    await this.monitoredTeamModel.findOneAndUpdate(
      { userId, countrySlug, teamId },
      { $pull: { players: playerId } },
    );
  }

  async getMonitoredTeams(
    userId: number,
    countrySlug?: string,
  ): Promise<MonitoredTeam[]> {
    const query: any = { userId };
    if (countrySlug) {
      query.countrySlug = countrySlug;
    }
    return this.monitoredTeamModel.find(query).exec();
  }

  async getAllMonitoredTeams(countrySlug?: string): Promise<MonitoredTeam[]> {
    const query: any = {};
    if (countrySlug) {
      query.countrySlug = countrySlug;
    }
    return this.monitoredTeamModel.find(query).exec();
  }

  async getPlayersForTeam(
    userId: number,
    countrySlug: string,
    teamId: number,
  ): Promise<number[]> {
    const team = await this.monitoredTeamModel
      .findOne({ userId, countrySlug, teamId })
      .exec();
    return team?.players ? [...team.players] : [];
  }

  async isPlayerMonitored(userId: number, playerId: number): Promise<boolean> {
    const count = await this.monitoredTeamModel
      .countDocuments({
        userId,
        players: playerId,
      })
      .exec();
    return count > 0;
  }

  async removeTeamFromMonitoring(
    userId: number,
    countrySlug: string,
    teamId: number,
  ): Promise<void> {
    await this.monitoredTeamModel
      .deleteOne({ userId, countrySlug, teamId })
      .exec();
  }

  async removeCountryFromMonitoring(
    userId: number,
    countrySlug: string,
  ): Promise<void> {
    await this.monitoredTeamModel.deleteMany({ userId, countrySlug }).exec();
  }

  //   async getMonitoredTeams(userId: number): Promise<MonitoredTeam[]> {
  //     return this.monitoredTeamModel.find({ userId: userId }).exec();
  //   }
}
