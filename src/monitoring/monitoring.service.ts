import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  FederationInfo,
  FederationSlug,
} from 'src/providers/dataproject/types';
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
    federationSlug: string,
    teamId: number,
    playerId: number,
  ): Promise<void> {
    await this.monitoredTeamModel.findOneAndUpdate(
      { userId, federationSlug, teamId },
      { $addToSet: { players: playerId } },
      { upsert: true, new: true },
    );
  }

  async removePlayerFromMonitoring(
    userId: number,
    federationSlug: string,
    teamId: number,
    playerId: number,
  ): Promise<void> {
    await this.monitoredTeamModel.findOneAndUpdate(
      { userId, federationSlug, teamId },
      { $pull: { players: playerId } },
    );
  }

  async getMonitoredTeams(
    userId: number,
    federationSlug?: string,
  ): Promise<MonitoredTeam[]> {
    const query: any = { userId };
    if (federationSlug) {
      query.federationSlug = federationSlug;
    }
    return this.monitoredTeamModel.find(query).exec();
  }

  async getAllMonitoredTeams(
    federation: FederationInfo,
  ): Promise<MonitoredTeam[]> {
    const query: any = {};
    if (federation) {
      query.federationSlug = federation.slug;
    }
    return this.monitoredTeamModel.find(query).exec();
  }

  async getPlayersForTeam(
    userId: number,
    federationSlug: FederationSlug,
    teamId: number,
  ): Promise<number[]> {
    const team = await this.monitoredTeamModel
      .findOne({ userId, federationSlug, teamId })
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
    federationSlug: string,
    teamId: number,
  ): Promise<void> {
    await this.monitoredTeamModel
      .deleteOne({ userId, federationSlug, teamId })
      .exec();
  }

  async removeFederationFromMonitoring(
    userId: number,
    federationSlug: string,
  ): Promise<void> {
    await this.monitoredTeamModel.deleteMany({ userId, federationSlug }).exec();
  }

  //   async getMonitoredTeams(userId: number): Promise<MonitoredTeam[]> {
  //     return this.monitoredTeamModel.find({ userId: userId }).exec();
  //   }
}
