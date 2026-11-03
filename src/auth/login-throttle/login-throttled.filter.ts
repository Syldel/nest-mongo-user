import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Response } from 'express';
import { DISABLE_AFTER_FAILURES } from './login-throttle.policy';
import { LoginThrottledError } from './login-throttle.service';

/** Insécable : vu à 360 px, l'unité « s. » partait seule à la ligne. */
const NBSP = '\u00a0';

/** « 30 s », « 2 min », « 1 h » : arrondi au-dessus, jamais une attente trop courte. */
export function formatWait(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds}${NBSP}s`;
  const minutes = Math.ceil(seconds / 60);
  return minutes < 60
    ? `${minutes}${NBSP}min`
    : `${Math.ceil(minutes / 60)}${NBSP}h`;
}

/**
 * Un essai refusé par la limitation répond 429. Le message dit combien de
 * temps attendre (NIST SP 800-63B-4 : informer l'utilisateur de l'attente),
 * et `Retry-After` le porte en secondes. La réponse est la même qu'un compte
 * existe ou non : la limitation s'applique aussi aux identifiants inconnus.
 */
@Catch(LoginThrottledError)
export class LoginThrottledFilter implements ExceptionFilter {
  catch(error: LoginThrottledError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { decision } = error;

    if (decision.reason === 'disabled') {
      response.status(429).json({
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Sign-in is disabled after ${DISABLE_AFTER_FAILURES} failed attempts in a row. An administrator must unlock it.`,
      });
      return;
    }

    const retryAfterSeconds = Math.ceil(decision.retryAfterMs / 1000);
    response.setHeader('Retry-After', String(retryAfterSeconds));
    response.status(429).json({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Too many failed sign-in attempts. Try again in ${formatWait(decision.retryAfterMs)}.`,
      retryAfterSeconds,
    });
  }
}
