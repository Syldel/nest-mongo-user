import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

/**
 * La clé d'agent d'un utilisateur, scellée : un JWE compact écrit par
 * `JweUtil.seal` de crypto-utils ≥ 2.0.0. Ce service ne la déchiffre jamais ;
 * seul le gateway l'ouvre.
 */
export type AgentKey = string;

/**
 * Le contexte auquel la clé est liée dans l'en-tête du JWE. Le gateway exige
 * exactement la même chaîne pour l'ouvrir (`nest-hyperliquid-gateway`,
 * `src/auth/agent-key.ts`) : une clé recopiée sur un autre utilisateur y est
 * refusée. Les deux définitions doivent rester identiques.
 */
export function agentKeyContext(userId: string): string {
  return `hl-agent-key:${userId}`;
}

/**
 * Lit ce qui est stocké en base. Le champ est `Mixed` et non `String` : mesuré
 * avec Mongoose 9.3.0, un chemin `String` lit un objet 1.x comme `undefined`
 * sans rien dire, et la route aurait répondu « aucune clé configurée » au lieu
 * de nommer le vrai problème.
 */
export function readStoredAgentKey(stored: unknown): AgentKey {
  if (stored === undefined || stored === null) {
    throw new NotFoundException('No agent key configured for this user');
  }
  if (typeof stored === 'string') {
    return stored;
  }
  if (typeof stored === 'object' && 'data' in stored && 'iv' in stored) {
    throw new ConflictException(
      'The stored agent key uses the crypto-utils 1.x format { data, iv, tag }: run set-agent-key again',
    );
  }
  throw new InternalServerErrorException(
    'The stored agent key has an unexpected shape',
  );
}
