import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ unique: true, required: true, lowercase: true, trim: true })
  walletAddress: string;

  @Prop({ unique: true, required: true, trim: true })
  username: string;

  @Prop({ required: true })
  password: string;

  @Prop({ type: Object, default: {} })
  tradingSettings: Record<string, any>;

  @Prop({ type: Object })
  agentKey: {
    encryptedData: string; // La clé d'agent chiffrée
    iv: string; // Le vecteur d'initialisation
    tag: string; // Le tag d'authentification AES-GCM
    address: string; // L'adresse publique de l'agent (utile pour l'API)
  };
}

export const UserSchema = SchemaFactory.createForClass(User);
