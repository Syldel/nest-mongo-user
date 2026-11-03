import { Model } from 'mongoose';
import { LoginThrottle } from '../auth/login-throttle/login-throttle.schema';

interface StoredThrottle {
  key: string;
  failures: number;
  nextAttemptAt: Date | null;
  expiresAt: Date | null;
}

/**
 * Les trois opérations Mongoose dont LoginThrottleService se sert, avec les
 * formes qu'elles rendent : `findOne().lean().exec()` un objet nu ou `null`,
 * `updateOne(…, { $set }, { upsert: true })` crée ou complète,
 * `deleteOne().exec()` `{ deletedCount }`. Rien d'autre n'est simulé : un
 * appel non prévu échoue au lieu de rendre une valeur inventée. L'index TTL,
 * lui, n'existe pas ici.
 */
export function inMemoryLoginThrottleModel() {
  const docs = new Map<string, StoredThrottle>();
  const exec = <T>(value: T) => ({ exec: () => Promise.resolve(value) });

  const model = {
    findOne: ({ key }: { key: string }) => ({
      lean: () => exec(docs.has(key) ? { ...docs.get(key)! } : null),
    }),
    updateOne: (
      { key }: { key: string },
      { $set }: { $set: Omit<StoredThrottle, 'key'> },
      { upsert }: { upsert?: boolean } = {},
    ) => {
      const existing = docs.get(key);
      if (existing || upsert) docs.set(key, { ...existing, key, ...$set });
      return exec({ acknowledged: true });
    },
    deleteOne: ({ key }: { key: string }) =>
      exec({ deletedCount: docs.delete(key) ? 1 : 0 }),
  };

  return { model: model as unknown as Model<LoginThrottle>, docs };
}
