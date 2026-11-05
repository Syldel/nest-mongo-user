/**
 * L'expiration d'un agent (API wallet Hyperliquid), telle que la page
 * https://app.hyperliquid.xyz/API l'affiche, et les données publiques d'agent
 * enregistrées à côté de la clé scellée.
 *
 * Ce que la page montre (relevé par l'utilisateur le 2026-11-05, agent de test
 * créé puis retiré) : un nom de moins de 17 caractères et un champ
 * « Days Valid » obligatoires (MAX = 180), puis dans le tableau une colonne
 * « Valid Until » écrite `04/05/2027 13:00:28`. Créé vers 12:00 à Paris
 * (11:00 UTC), il valait 11:00:28 UTC + 180 × 24 h : la page affiche donc
 * l'heure **locale du navigateur**, heure d'été comprise (13:00 en CEST), au
 * format de la locale française, jour d'abord. ⚠️ Déduit d'un seul relevé et
 * d'une heure de clic approximative, pas mesuré ; `extraAgents` le confirmera
 * au test final.
 *
 * D'où une saisie qui recopie la page telle quelle, lue dans le fuseau **du
 * navigateur qui a affiché la page**, demandé à l'utilisateur
 * (`resolveTimeZone`). Le fuseau de la machine n'est qu'une proposition : le
 * script peut tourner sur un serveur en UTC, ou loin du navigateur. Il était
 * codé en dur (`Europe/Paris`) jusqu'au 2026-11-05.
 */

/** Ce que la doc de `approveAgent` autorise : au plus 180 jours plus tard. */
export const MAX_AGENT_VALIDITY_DAYS = 180;

/** La page refuse un nom de 17 caractères ou plus. */
export const MAX_AGENT_NAME_LENGTH = 16;

const DAY_MS = 24 * 60 * 60 * 1000;

// Une horloge de poste légèrement en retard sur celle de Hyperliquid ne doit
// pas faire refuser un agent créé à l'instant avec MAX.
const CLOCK_TOLERANCE_MS = 10 * 60 * 1000;

const DASHBOARD_FORMAT = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/;

export const DASHBOARD_FORMAT_HINT = 'DD/MM/YYYY HH:mm:ss';

export type TimeZoneResult =
  | { ok: true; timeZone: string }
  | { ok: false; reason: string };

/**
 * Le fuseau saisi, ou celui de la machine si la saisie est vide. Seul un nom
 * IANA est accepté (`Europe/Paris`, `America/New_York`, `UTC`), rendu sous
 * sa forme canonique (`europe/paris` → `Europe/Paris`).
 *
 * Un décalage fixe (`+01:00`), que `Intl` accepte, est refusé : il ignore
 * l'heure d'été, et une date de mai lue à +01:00 serait décalée d'une heure
 * pour un navigateur à Paris, sans aucune erreur.
 */
export function resolveTimeZone(
  input: string,
  machineTimeZone: string,
): TimeZoneResult {
  const wanted = input.trim() === '' ? machineTimeZone : input.trim();
  if (!/^[A-Za-z]/.test(wanted)) {
    return {
      ok: false,
      reason: `Expected an IANA time zone name such as Europe/Paris, not a fixed offset (${wanted}): it would ignore daylight saving time`,
    };
  }
  try {
    const timeZone = new Intl.DateTimeFormat('en-US', {
      timeZone: wanted,
    }).resolvedOptions().timeZone;
    return { ok: true, timeZone };
  } catch {
    return {
      ok: false,
      reason: `Unknown time zone "${wanted}": use an IANA name such as Europe/Paris`,
    };
  }
}

export type ParseResult =
  | { ok: true; validUntil: Date }
  | { ok: false; reason: string };

/**
 * Lit « Valid Until » tel que la page l'affiche, `DD/MM/YYYY HH:mm:ss`, dans
 * le fuseau `timeZone`. Refuse tout ce qui ne désigne pas un seul instant
 * futur atteignable : un autre format, une date qui n'existe pas (31/02, ou
 * une heure sautée au passage à l'heure d'été), une heure ambiguë (celle qui
 * se répète au retour à l'heure d'hiver), une date passée, ou plus de
 * 180 jours après `now`.
 *
 * ⚠️ Une confusion jour/mois (04/05 lu 05/04) peut tomber dans la fenêtre des
 * 180 jours : aucun contrôle ne l'attrape ici, d'où la date réécrite en toutes
 * lettres et la confirmation dans le script.
 */
export function parseDashboardValidUntil(
  input: string,
  timeZone: string,
  now: Date,
): ParseResult {
  const match = DASHBOARD_FORMAT.exec(input.trim());
  if (!match) {
    return {
      ok: false,
      reason: `Expected ${DASHBOARD_FORMAT_HINT}, exactly as the API page shows it (e.g. 04/05/2027 13:00:28)`,
    };
  }
  const [day, month, year, hour, minute, second] = match.slice(1).map(Number);
  const wanted = { year, month, day, hour, minute, second };

  // Les champs lus comme s'ils étaient UTC, puis corrigés du décalage du
  // fuseau. Le décalage se prend un jour avant et un jour après : un seul
  // changement d'heure tient dans cet intervalle, et les deux candidats
  // couvrent les deux côtés. Seuls ceux qui se réécrivent exactement en
  // `wanted` dans le fuseau sont retenus.
  const naive = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsets = new Set([
    offsetMs(naive - DAY_MS, timeZone),
    offsetMs(naive + DAY_MS, timeZone),
  ]);
  const instants = [...offsets]
    .map((offset) => naive - offset)
    .filter((instant) => sameFields(fieldsIn(instant, timeZone), wanted));

  if (instants.length === 0) {
    return {
      ok: false,
      reason: `${input.trim()} does not exist in ${timeZone} (invalid date, or an hour skipped by a clock change)`,
    };
  }
  if (instants.length > 1) {
    return {
      ok: false,
      reason: `${input.trim()} happens twice in ${timeZone} (clock change): cannot tell which one`,
    };
  }

  const validUntil = new Date(instants[0]);
  if (validUntil.getTime() <= now.getTime()) {
    return { ok: false, reason: 'This date is already past' };
  }
  const latest =
    now.getTime() + MAX_AGENT_VALIDITY_DAYS * DAY_MS + CLOCK_TOLERANCE_MS;
  if (validUntil.getTime() > latest) {
    return {
      ok: false,
      reason: `Hyperliquid allows at most ${MAX_AGENT_VALIDITY_DAYS} days: is the day/month order right?`,
    };
  }
  return { ok: true, validUntil };
}

/**
 * La date réécrite pour la confirmation : en toutes lettres (le mois en mot,
 * pour qu'une inversion jour/mois saute aux yeux), dans le fuseau et en UTC,
 * avec le nombre de jours restants.
 */
export function describeValidUntil(
  validUntil: Date,
  timeZone: string,
  now: Date,
): string {
  // Assemblé à la main depuis `formatToParts` : la ponctuation de `format`
  // (virgule, « at ») change avec les données ICU de Node.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'long',
    month: 'long',
  }).formatToParts(validUntil);
  const word = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value;
  const f = fieldsIn(validUntil.getTime(), timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  const local = `${word('weekday')} ${f.day} ${word('month')} ${f.year}, ${pad(f.hour)}:${pad(f.minute)}:${pad(f.second)}`;
  const days = (validUntil.getTime() - now.getTime()) / DAY_MS;
  return `${local} ${timeZone} = ${validUntil.toISOString()} UTC, in ${days.toFixed(1)} days`;
}

/** Un nom tel que la page l'accepte : 1 à 16 caractères, sans contrôle. */
export function validateAgentName(name: string): true | string {
  if (name.length === 0 || name.length > MAX_AGENT_NAME_LENGTH) {
    return `The API wallet name has 1 to ${MAX_AGENT_NAME_LENGTH} characters on Hyperliquid's API page`;
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    return 'The name contains a control character';
  }
  return true;
}

type Fields = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function fieldsIn(instant: number, timeZone: string): Fields {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** Le décalage du fuseau à cet instant : heure locale moins UTC, en ms. */
function offsetMs(instant: number, timeZone: string): number {
  const f = fieldsIn(instant, timeZone);
  const asUtc = Date.UTC(
    f.year,
    f.month - 1,
    f.day,
    f.hour,
    f.minute,
    f.second,
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

function sameFields(a: Fields, b: Fields): boolean {
  return (
    a.year === b.year &&
    a.month === b.month &&
    a.day === b.day &&
    a.hour === b.hour &&
    a.minute === b.minute &&
    a.second === b.second
  );
}

/**
 * Refuse la clé du **wallet maître** collée à la place de celle d'un agent.
 * Elle passerait tous les autres contrôles (format, adresse dérivée) et
 * signerait ensuite les ordres, avec des pouvoirs qu'un agent n'a pas :
 * retraits, transferts, approbation d'agents. Comparé en minuscules : la base
 * garde l'adresse du wallet en minuscules, la dérivation la rend en EIP-55.
 */
export function masterWalletRefusal(
  agentAddress: string,
  masterWalletAddress: string,
): string | null {
  if (agentAddress.toLowerCase() !== masterWalletAddress.toLowerCase()) {
    return null;
  }
  return `This key belongs to the master wallet ${masterWalletAddress}, not to an API wallet: never store it. Generate an API wallet on Hyperliquid's API page and paste its key.`;
}
