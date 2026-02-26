import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import type { AgentKey } from '../auth/interfaces/agent-key.interface';

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ unique: true, required: true, lowercase: true, trim: true })
  walletAddress: string;

  @Prop({ unique: true, required: true, lowercase: true, trim: true })
  username: string;

  @Prop({ required: true, select: false })
  password: string;

  @Prop({ type: Object, default: {} })
  tradingSettings: Record<string, any>;

  @Prop({ type: Object, select: false })
  agentKey?: AgentKey;
}

export const UserSchema = SchemaFactory.createForClass(User);
