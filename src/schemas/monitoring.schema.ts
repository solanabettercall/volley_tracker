import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class MonitoredTeam extends Document {
  @Prop({ required: true, type: Number })
  userId: number;

  @Prop({ required: true, type: String })
  federationSlug: string;

  @Prop({ required: true, type: Number })
  teamId: number;

  @Prop({ required: true, type: Number })
  competitionId: number;

  @Prop({ type: [Number], default: [] })
  players: number[];
}

export const MonitoredTeamSchema = SchemaFactory.createForClass(MonitoredTeam);
