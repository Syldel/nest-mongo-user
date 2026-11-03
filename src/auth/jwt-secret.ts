/**
 * Le seul algorithme de signature des jetons de ce service. Il est imposé à la
 * vérification (RFC 8725 §3.1) : sans liste, `jsonwebtoken` accepte HS256,
 * HS384 et HS512 dès que la clé est une chaîne (`HS_ALGS` dans son verify.js).
 */
export const JWT_ALGORITHM = 'HS256';

/**
 * Le secret doit être exactement 64 caractères hexadécimaux : la forme que
 * produit `crypto.randomBytes(32).toString('hex')`, soit 256 bits d'aléa, la
 * taille de sortie de HS256 (fiche JWT de l'OWASP, section MAC ; RFC 8725
 * §3.5, qui interdit un mot de passe comme clé). Une longueur seule ne
 * prouvait pas l'aléa : « ceci-est-mon-mot-de-passe-de-prod » fait 33 octets.
 * Même règle que `PureJwtUtil` de crypto-utils ≥ 3.0.0, qui signe et vérifie
 * les mêmes jetons dans le gateway et le bot.
 */
const SECRET_PATTERN = /^[0-9a-fA-F]{64}$/;

/**
 * Lit un secret de signature et refuse, en le nommant, un secret absent ou
 * mal formé : le service ne démarre pas plutôt que de signer avec une clé
 * devinable. Le message ne cite jamais la valeur.
 */
export function requireJwtSecret(
  name: string,
  value: string | undefined,
): string {
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is not defined in environment variables`);
  }
  if (!SECRET_PATTERN.test(value)) {
    const allHex = /^[0-9a-fA-F]*$/.test(value);
    throw new Error(
      `${name} must be 64 hex characters, got ${value.length} characters${allHex ? '' : ', not all hex'} (generate it with crypto.randomBytes(32).toString('hex'))`,
    );
  }
  return value;
}
