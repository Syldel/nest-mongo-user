import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

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

  // Un JWE compact depuis crypto-utils 2.0.0, mais le chemin reste `Mixed` :
  // un objet 1.x encore en base doit se lire tel quel pour être refusé en le
  // nommant (voir `readStoredAgentKey`), pas disparaître en `undefined`.
  @Prop({ type: MongooseSchema.Types.Mixed, select: false })
  agentKey?: unknown;
}

export const UserSchema = SchemaFactory.createForClass(User);
