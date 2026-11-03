import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * L'état de limitation d'un identifiant de connexion. Une collection à part
 * et non des champs du document utilisateur : `MongoWatcherService` envoie un
 * webhook au gateway et au bot à chaque modification de `users`, et chaque
 * mot de passe faux en aurait déclenché un. Elle ne sort pas non plus par les
 * routes qui renvoient l'utilisateur.
 */
@Schema({ collection: 'login_throttles' })
export class LoginThrottle extends Document {
  /** `account:<id>` pour un compte connu, `username:…` ou `wallet:…` sinon. */
  @Prop({ required: true, unique: true })
  key: string;

  @Prop({ required: true, default: 0 })
  failures: number;

  @Prop({ type: Date, default: null })
  nextAttemptAt: Date | null;

  /**
   * Effacement automatique (index TTL) un jour après le dernier échec. `null`
   * une fois la connexion désactivée : elle ne se rouvre que par le script
   * `unlock-login`, jamais d'elle-même.
   */
  @Prop({ type: Date, default: null })
  expiresAt: Date | null;
}

export const LoginThrottleSchema = SchemaFactory.createForClass(LoginThrottle);
LoginThrottleSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
