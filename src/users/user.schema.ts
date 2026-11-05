import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

// Un sous-schéma explicite, et non un objet littéral en `type` : chaque champ
// y est requis, donc un `agent` partiel est refusé à l'écriture au lieu d'être
// enregistré sans expiration.
const AgentInfoSchema = new MongooseSchema(
  {
    address: { type: String, required: true, match: /^0x[0-9a-fA-F]{40}$/ },
    name: { type: String, required: true, minlength: 1, maxlength: 16 },
    validUntil: { type: Date, required: true },
    keyUpdatedAt: { type: Date, required: true },
  },
  { _id: false },
);

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

  // Public, à la différence de la clé : `/auth/me` le renvoie au mobile, qui
  // affiche l'expiration. Écrit avec la clé, en une seule mise à jour, par
  // `set-agent-key` seulement. Voir `AgentInfo` et `agent-validity.ts`.
  @Prop({ type: AgentInfoSchema, required: false })
  agent?: {
    address: string;
    name: string;
    validUntil: Date;
    keyUpdatedAt: Date;
  };
}

export const UserSchema = SchemaFactory.createForClass(User);
