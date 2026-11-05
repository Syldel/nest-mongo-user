import {
  describeValidUntil,
  parseDashboardValidUntil,
  resolveTimeZone,
  validateAgentName,
} from './agent-validity';

const PARIS = 'Europe/Paris';

function parsed(input: string, now: Date, timeZone = PARIS) {
  const result = parseDashboardValidUntil(input, timeZone, now);
  if (!result.ok) throw new Error(`refused: ${result.reason}`);
  return result.validUntil.toISOString();
}

function reason(input: string, now: Date, timeZone = PARIS) {
  const result = parseDashboardValidUntil(input, timeZone, now);
  if (result.ok)
    throw new Error(`accepted: ${result.validUntil.toISOString()}`);
  return result.reason;
}

describe('parseDashboardValidUntil', () => {
  // L'heure du relevé de l'agent de test, le 2026-11-05.
  const now = new Date('2026-11-05T11:02:27Z');

  // Le relevé lui-même : 13:00:28 affiché en mai, heure d'été (UTC+2).
  it('should read the API page value as Paris time, day first', () => {
    expect(parsed('04/05/2027 13:00:28', now)).toBe('2027-05-04T11:00:28.000Z');
  });

  it('should apply winter time (UTC+1) to a winter date', () => {
    expect(parsed('15/01/2027 10:00:00', now)).toBe('2027-01-15T09:00:00.000Z');
  });

  // Le fuseau est un paramètre, pas celui de la machine : sur un serveur en
  // UTC, la même saisie désignerait un autre instant.
  it('should depend on the named zone, not on the machine', () => {
    expect(parsed('04/05/2027 11:00:28', now, 'UTC')).toBe(
      '2027-05-04T11:00:28.000Z',
    );
    expect(parsed('04/05/2027 11:00:28', now)).toBe('2027-05-04T09:00:28.000Z');
  });

  it('should ignore surrounding whitespace from a paste', () => {
    expect(parsed('  04/05/2027 13:00:28 ', now)).toBe(
      '2027-05-04T11:00:28.000Z',
    );
  });

  it.each([
    ['ISO order', '2027-05-04 13:00:28'],
    ['single-digit day and month', '4/5/2027 13:00:28'],
    ['no seconds', '04/05/2027 13:00'],
    ['no time', '04/05/2027'],
    ['a 12-hour clock', '04/05/2027 01:00:28 PM'],
    ['an empty string', ''],
  ])('should refuse %s', (_label, input) => {
    expect(reason(input, now)).toMatch(/^Expected DD\/MM\/YYYY HH:mm:ss/);
  });

  it.each([
    ['a 31st of February', '31/02/2027 10:00:00'],
    ['a 13th month', '01/13/2027 10:00:00'],
    ['hour 24', '04/05/2027 24:00:00'],
    ['minute 60', '04/05/2027 13:60:00'],
  ])('should refuse %s instead of rolling it over', (_label, input) => {
    expect(reason(input, now)).toMatch(/does not exist in Europe\/Paris/);
  });

  // Le 28 mars 2027, Paris passe de 02:00 à 03:00 : 02:30 n'existe pas.
  it('should refuse an hour skipped by the spring clock change', () => {
    expect(reason('28/03/2027 02:30:00', now)).toMatch(
      /does not exist in Europe\/Paris/,
    );
  });

  // Le 31 octobre 2027, 02:30 a lieu deux fois : on ne choisit pas.
  it('should refuse an hour repeated by the autumn clock change', () => {
    const later = new Date('2027-06-01T00:00:00Z');
    expect(reason('31/10/2027 02:30:00', later)).toMatch(/happens twice/);
  });

  it('should read the hours on each side of a clock change', () => {
    const later = new Date('2027-06-01T00:00:00Z');
    expect(parsed('31/10/2027 01:59:59', later)).toBe(
      '2027-10-30T23:59:59.000Z',
    );
    expect(parsed('31/10/2027 03:00:00', later)).toBe(
      '2027-10-31T02:00:00.000Z',
    );
    expect(parsed('28/03/2027 03:00:00', now)).toBe('2027-03-28T01:00:00.000Z');
  });

  it('should refuse a date already past, and the present instant', () => {
    expect(reason('05/11/2026 10:00:00', now)).toBe(
      'This date is already past',
    );
    // 12:02:27 à Paris = `now`
    expect(reason('05/11/2026 12:02:27', now)).toBe(
      'This date is already past',
    );
  });

  // Hyperliquid n'accepte pas plus de 180 jours : au-delà, c'est presque
  // toujours un jour et un mois inversés.
  it('should refuse more than 180 days ahead, naming the likely cause', () => {
    expect(reason('05/06/2027 13:00:00', now)).toMatch(
      /at most 180 days: is the day\/month order right\?/,
    );
  });

  // Créé à l'instant avec MAX, l'agent vaut `now` + 180 jours : une horloge
  // locale un peu en retard ne doit pas le faire refuser.
  it('should accept now + 180 days within a ten-minute clock tolerance', () => {
    const plus180 = new Date(now.getTime() + 180 * 86_400_000);
    expect(plus180.toISOString()).toBe('2027-05-04T11:02:27.000Z');
    expect(parsed('04/05/2027 13:12:27', now)).toBe('2027-05-04T11:12:27.000Z');
    expect(reason('04/05/2027 13:12:28', now)).toMatch(/at most 180 days/);
  });

  // La limite connue : une inversion qui reste dans la fenêtre passe. C'est
  // la confirmation en toutes lettres du script qui doit l'attraper.
  it('should accept a day/month swap that stays within 180 days', () => {
    expect(parsed('05/04/2027 13:00:28', now)).toBe('2027-04-05T11:00:28.000Z');
  });
});

describe('describeValidUntil', () => {
  const now = new Date('2026-11-05T11:02:27Z');

  // Le mois en mot : une inversion jour/mois saute aux yeux.
  it('should spell the date out in the zone and in UTC, with the days left', () => {
    expect(
      describeValidUntil(new Date('2027-05-04T11:00:28Z'), PARIS, now),
    ).toBe(
      'Tuesday 4 May 2027, 13:00:28 Europe/Paris = 2027-05-04T11:00:28.000Z UTC, in 180.0 days',
    );
  });
});

describe('validateAgentName', () => {
  it.each(['a', 'wallet_key_test', 'x'.repeat(16)])(
    'should accept %p',
    (name) => {
      expect(validateAgentName(name)).toBe(true);
    },
  );

  it.each(['', 'x'.repeat(17)])('should refuse %p by its length', (name) => {
    expect(validateAgentName(name)).toMatch(/1 to 16 characters/);
  });

  it('should refuse a control character', () => {
    expect(validateAgentName('bot\tmain')).toBe(
      'The name contains a control character',
    );
  });
});

describe('resolveTimeZone', () => {
  // Le fuseau de la machine n'est qu'une proposition, prise sur une saisie vide.
  it('should take the machine zone on an empty answer', () => {
    expect(resolveTimeZone('  ', 'Europe/Paris')).toEqual({
      ok: true,
      timeZone: 'Europe/Paris',
    });
  });

  it('should prefer the typed zone over the machine zone', () => {
    expect(resolveTimeZone('America/New_York', 'UTC')).toEqual({
      ok: true,
      timeZone: 'America/New_York',
    });
  });

  it('should write a zone in its canonical spelling', () => {
    expect(resolveTimeZone('europe/paris', 'UTC')).toEqual({
      ok: true,
      timeZone: 'Europe/Paris',
    });
  });

  it('should accept UTC', () => {
    expect(resolveTimeZone('UTC', 'Europe/Paris')).toEqual({
      ok: true,
      timeZone: 'UTC',
    });
  });

  it('should refuse an unknown zone by name', () => {
    expect(resolveTimeZone('Europe/Atlantis', 'UTC')).toEqual({
      ok: false,
      reason:
        'Unknown time zone "Europe/Atlantis": use an IANA name such as Europe/Paris',
    });
  });

  // Un décalage fixe ignore l'heure d'été : une date de mai serait lue avec
  // une heure d'écart pour un navigateur à Paris.
  it.each(['+01:00', '-05:00', '+0100'])(
    'should refuse the fixed offset %s',
    (offset) => {
      const result = resolveTimeZone(offset, 'UTC');
      expect(result.ok).toBe(false);
      expect(!result.ok && result.reason).toMatch(/not a fixed offset/);
    },
  );

  // Ce que le refus évite : la même saisie, lue à +01:00 au lieu de Paris.
  it('should matter: Paris and a fixed +01:00 differ by an hour in summer', () => {
    const now = new Date('2026-11-06T00:00:00Z');
    const paris = parseDashboardValidUntil(
      '04/05/2027 13:00:28',
      'Europe/Paris',
      now,
    );
    const fixed = parseDashboardValidUntil(
      '04/05/2027 13:00:28',
      'Etc/GMT-1',
      now,
    );
    expect(paris.ok && fixed.ok).toBe(true);
    if (paris.ok && fixed.ok) {
      expect(fixed.validUntil.getTime() - paris.validUntil.getTime()).toBe(
        3_600_000,
      );
    }
  });
});
