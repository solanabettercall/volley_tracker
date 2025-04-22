import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  FederationInfo,
  FederationSlug,
} from 'src/providers/dataproject/types';
import { MonitoredTeam } from 'src/schemas/monitoring.schema';

export interface MonitoringPlayerDto {
  userId: number;
  federationSlug: string;
  teamId: number;
  playerId: number;
  competitionId: number;
}

@Injectable()
export class MonitoringService implements OnApplicationBootstrap {
  constructor(
    @InjectModel('MonitoredTeam')
    private readonly monitoredTeamModel: Model<MonitoredTeam>,
  ) {}

  async onApplicationBootstrap() {}

  async clearMonitoring(chatId?: number) {
    await this.monitoredTeamModel.deleteMany({ userId: chatId });
  }

  async addPlayerToMonitoring(dto: MonitoringPlayerDto): Promise<void> {
    await this.monitoredTeamModel.findOneAndUpdate(
      {
        userId: dto.userId,
        federationSlug: dto.federationSlug,
        teamId: dto.teamId,
        competitionId: dto.competitionId,
      },
      { $addToSet: { players: dto.playerId } },
      { upsert: true, new: true },
    );
  }

  async removePlayerFromMonitoring(dto: MonitoringPlayerDto): Promise<void> {
    await this.monitoredTeamModel.findOneAndUpdate(
      {
        userId: dto.userId,
        federationSlug: dto.federationSlug,
        teamId: dto.teamId,
        competitionId: dto.competitionId,
      },
      { $pull: { players: dto.playerId } },
    );
  }

  async getMonitoredTeams(
    userId: number,
    federationSlug?: string,
    competitionId?: number,
  ): Promise<MonitoredTeam[]> {
    const query: any = { userId, federationSlug, competitionId };

    return this.monitoredTeamModel.find(query).exec();
  }

  async getMonitoredCompetitionIds(
    userId: number,
    federationSlug: string,
  ): Promise<number[]> {
    const query: any = { userId, federationSlug };

    const teams = await this.monitoredTeamModel.find(query).exec();

    const uniqueIds = Array.from(new Set(teams.map((t) => t.competitionId)));

    return uniqueIds;
  }

  async getMonitoredFederationSlugs(userId: number): Promise<string[]> {
    const teams = await this.monitoredTeamModel
      .find({ userId }, 'federationSlug')
      .lean()
      .exec();

    const federationSlugs = Array.from(
      new Set(teams.map((t) => t.federationSlug)),
    );

    return federationSlugs;
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
