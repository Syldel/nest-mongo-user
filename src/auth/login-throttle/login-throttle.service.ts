import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  afterFailure,
  decide,
  DISABLE_AFTER_FAILURES,
  FREE_ATTEMPTS,
  FRESH_STATE,
  ThrottleDecision,
  ThrottleState,
} from './login-throttle.policy';
import { LoginThrottle } from './login-throttle.schema';

/** Un essai refusé sans être examiné : le mot de passe n'a pas été comparé. */
export class LoginThrottledError extends Error {
  constructor(readonly decision: Exclude<ThrottleDecision, { allowed: true }>) {
    super(
      decision.reason === 'disabled'
        ? 'Sign-in disabled after too many failed attempts'
        : 'Sign-in attempt refused: waiting period',
    );
    this.name = 'LoginThrottledError';
  }
}

/** Un jour sans nouvel échec, et l'état est oublié. */
const FORGET_AFTER_MS = 24 * 60 * 60_000;

@Injectable()
export class LoginThrottleService {
  private readonly logger = new Logger(LoginThrottleService.name);
  private readonly queues = new Map<string, Promise<void>>();

  /** L'horloge, remplacée par les tests. */
  now: () => Date = () => new Date();

  constructor(
    @InjectModel(LoginThrottle.name)
    private readonly model: Model<LoginThrottle>,
  ) {}

  /**
   * Examine un essai de mot de passe pour `key`, si la limitation le permet.
   * `verify` compare le mot de passe et rend `true` s'il est juste. Lève
   * `LoginThrottledError` sans appeler `verify` pendant une attente, ou une
   * fois la connexion désactivée — même avec le bon mot de passe, sans quoi
   * l'attaquant n'aurait qu'à continuer d'essayer.
   *
   * ⚠️ Les essais d'une même clé passent l'un après l'autre, dans ce processus :
   * sans cela, cinquante requêtes simultanées liraient toutes « 4 échecs » et
   * seraient toutes examinées. Cela suppose une seule instance du service,
   * ce qui est le cas (un conteneur Dokku). Avec plusieurs instances, il
   * faudrait une mise à jour atomique dans Mongo à la place.
   */
  attempt(key: string, verify: () => Promise<boolean>): Promise<boolean> {
    return this.serialize(key, async () => {
      const state = await this.read(key);
      const decision = decide(state, this.now());
      if (!decision.allowed) {
        throw new LoginThrottledError(decision);
      }

      const valid = await verify();
      if (valid) {
        // NIST SP 800-63B-4 §3.2.2 : après un succès, les échecs sont oubliés.
        if (state.failures > 0) await this.model.deleteOne({ key }).exec();
        return true;
      }

      const next = afterFailure(state, this.now());
      await this.write(key, next);
      this.report(key, next);
      return false;
    });
  }

  /** Efface l'état d'une clé : le script `unlock-login`. */
  async unlock(key: string): Promise<boolean> {
    const { deletedCount } = await this.model.deleteOne({ key }).exec();
    return deletedCount > 0;
  }

  private async read(key: string): Promise<ThrottleState> {
    const doc = await this.model.findOne({ key }).lean().exec();
    if (!doc) return FRESH_STATE;
    return { failures: doc.failures, nextAttemptAt: doc.nextAttemptAt ?? null };
  }

  private async write(key: string, state: ThrottleState): Promise<void> {
    const disabled = state.failures >= DISABLE_AFTER_FAILURES;
    await this.model
      .updateOne(
        { key },
        {
          $set: {
            failures: state.failures,
            nextAttemptAt: state.nextAttemptAt,
            expiresAt: disabled
              ? null
              : new Date(this.now().getTime() + FORGET_AFTER_MS),
          },
        },
        { upsert: true },
      )
      .exec();
  }

  /**
   * Les passages de seuil se journalisent (OWASP : des métriques pour voir
   * une attaque) ; l'identifiant y figure, jamais le mot de passe.
   */
  private report(key: string, state: ThrottleState): void {
    if (state.failures === FREE_ATTEMPTS) {
      this.logger.warn(
        `${key}: ${FREE_ATTEMPTS} failed sign-in attempts in a row, waiting periods start`,
      );
    } else if (state.failures === DISABLE_AFTER_FAILURES) {
      this.logger.error(
        `${key}: ${DISABLE_AFTER_FAILURES} failed sign-in attempts in a row, sign-in disabled until unlock-login`,
      );
    }
  }

  private serialize<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(key) ?? Promise.resolve();
    const run = previous.then(task);
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    this.queues.set(key, tail);
    void tail.then(() => {
      if (this.queues.get(key) === tail) this.queues.delete(key);
    });
    return run;
  }
}
