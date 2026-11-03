/**
 * Limitation des tentatives de connexion, par compte. Lu en brut le 2026-11-03 :
 *
 * - NIST SP 800-63B-4 §3.2.2 « Rate Limiting (Throttling) » : au plus 100
 *   échecs consécutifs sur un compte, après quoi l'authentifiant est désactivé
 *   jusqu'à un nouveau rattachement ; une attente qui grandit à l'approche de
 *   la limite est l'une des techniques proposées pour ne pas enfermer
 *   l'utilisateur légitime (« 30 seconds up to an hour ») ; après un succès,
 *   les échecs précédents SHOULD être oubliés ; et l'utilisateur doit savoir
 *   combien de temps attendre.
 * - OWASP Authentication Cheat Sheet, « Account Lockout » : un compteur lié au
 *   compte et non à l'adresse IP, et un blocage qui double à chaque échec.
 *
 * Ce module ne fait que décider, sans horloge ni stockage.
 */

/** Échecs consécutifs tolérés avant la première attente. */
export const FREE_ATTEMPTS = 5;

/** Première attente, puis doublée à chaque échec. */
export const FIRST_DELAY_MS = 30_000;

/** Attente maximale entre deux essais. */
export const MAX_DELAY_MS = 60 * 60_000;

/** Échecs consécutifs après lesquels la connexion par mot de passe est désactivée (le plafond du NIST). */
export const DISABLE_AFTER_FAILURES = 100;

export interface ThrottleState {
  /** Échecs consécutifs depuis le dernier succès. */
  failures: number;
  /** Avant cette date, aucun essai n'est examiné. `null` : pas d'attente. */
  nextAttemptAt: Date | null;
}

export const FRESH_STATE: ThrottleState = { failures: 0, nextAttemptAt: null };

export type ThrottleDecision =
  | { allowed: true }
  | { allowed: false; reason: 'wait'; retryAfterMs: number }
  | { allowed: false; reason: 'disabled' };

/**
 * L'attente imposée après `failures` échecs consécutifs : aucune pour les
 * cinq premiers, puis 30 s, 1 min, 2 min… jusqu'à 1 h.
 */
export function delayAfterFailures(failures: number): number {
  if (failures < FREE_ATTEMPTS) return 0;
  const doublings = failures - FREE_ATTEMPTS;
  // 30 s × 2^7 dépasse déjà l'heure : inutile de calculer plus loin.
  return doublings >= 7
    ? MAX_DELAY_MS
    : Math.min(FIRST_DELAY_MS * 2 ** doublings, MAX_DELAY_MS);
}

/**
 * Un essai peut-il être examiné maintenant ? Un essai refusé n'est pas compté :
 * seul un mot de passe réellement comparé fait avancer le compteur, sans quoi
 * insister pendant l'attente rapprocherait la désactivation sans rien essayer.
 */
export function decide(state: ThrottleState, now: Date): ThrottleDecision {
  if (state.failures >= DISABLE_AFTER_FAILURES) {
    return { allowed: false, reason: 'disabled' };
  }
  if (state.nextAttemptAt && state.nextAttemptAt.getTime() > now.getTime()) {
    return {
      allowed: false,
      reason: 'wait',
      retryAfterMs: state.nextAttemptAt.getTime() - now.getTime(),
    };
  }
  return { allowed: true };
}

/** L'état après un mot de passe faux. */
export function afterFailure(state: ThrottleState, now: Date): ThrottleState {
  const failures = state.failures + 1;
  const delay = delayAfterFailures(failures);
  return {
    failures,
    nextAttemptAt: delay > 0 ? new Date(now.getTime() + delay) : null,
  };
}
