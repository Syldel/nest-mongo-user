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
 * Les données publiques de l'agent, enregistrées avec la clé par
 * `set-agent-key` (voir `agent-validity.ts`). Côté mobile :
 * `ExternalUserAgent` de trading-shared-types ; côté gateway, la réponse de
 * `agent-credentials` (`nest-hyperliquid-gateway`, `src/auth/agent-key.ts`).
 * Les trois formes doivent rester identiques.
 */
export interface AgentInfo {
  address: string;
  name: string;
  validUntil: Date;
  keyUpdatedAt: Date;
}

/**
 * Lit le sous-document `agent`. Absent : `null`, que le gateway refuse en le
 * nommant (une clé enregistrée avant qu'on demande son expiration). Présent
 * mais mal formé : une erreur, jamais une valeur devinée — une date illisible
 * prise pour « pas d'expiration » laisserait signer avec un agent mort.
 */
export function readStoredAgent(stored: unknown): AgentInfo | null {
  if (stored === undefined || stored === null) return null;
  const agent = stored as Partial<Record<keyof AgentInfo, unknown>>;
  const isDate = (v: unknown): v is Date =>
    v instanceof Date && !Number.isNaN(v.getTime());
  if (
    typeof agent.address === 'string' &&
    /^0x[0-9a-fA-F]{40}$/.test(agent.address) &&
    typeof agent.name === 'string' &&
    agent.name.length > 0 &&
    isDate(agent.validUntil) &&
    isDate(agent.keyUpdatedAt)
  ) {
    return {
      address: agent.address,
      name: agent.name,
      validUntil: agent.validUntil,
      keyUpdatedAt: agent.keyUpdatedAt,
    };
  }
  throw new InternalServerErrorException(
    'The stored agent data has an unexpected shape: run set-agent-key again',
  );
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
