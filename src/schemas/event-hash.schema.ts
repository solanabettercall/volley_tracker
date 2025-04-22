import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class EventHash extends Document {
  @Prop({ required: true, type: String })
  hash: string;

  @Prop({ required: true, type: Date, default: Date.now })
  createdAt: Date;
}

export const EventHashSchema = SchemaFactory.createForClass(EventHash);
