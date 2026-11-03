/**
 * Le seul algorithme de signature des jetons de ce service. Il est imposé à la
 * vérification (RFC 8725 §3.1) : sans liste, `jsonwebtoken` accepte HS256,
 * HS384 et HS512 dès que la clé est une chaîne (`HS_ALGS` dans son verify.js).
 */
export const JWT_ALGORITHM = 'HS256';

/**
 * 256 bits, la taille de sortie de HS256 : le minimum de la fiche JWT de
 * l'OWASP (section MAC) et de la RFC 8725 §3.5, qui interdit un mot de passe
 * comme clé. La longueur est nécessaire, pas suffisante : la valeur doit
 * venir d'un générateur sûr (`crypto.randomBytes(32).toString('hex')`).
 */
export const MIN_SECRET_BYTES = 32;

/**
 * Lit un secret de signature et refuse, en le nommant, un secret absent ou
 * trop court : le service ne démarre pas plutôt que de signer avec une clé
 * devinable. Le message ne cite jamais la valeur.
 */
export function requireJwtSecret(
  name: string,
  value: string | undefined,
): string {
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is not defined in environment variables`);
  }
  const bytes = Buffer.byteLength(value, 'utf8');
  if (bytes < MIN_SECRET_BYTES) {
    throw new Error(
      `${name} is too short: ${bytes} bytes, at least ${MIN_SECRET_BYTES} required (generate it with crypto.randomBytes(32).toString('hex'))`,
    );
  }
  return value;
}
