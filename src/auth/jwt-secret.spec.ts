import { randomBytes } from 'crypto';
import { requireJwtSecret } from './jwt-secret';

describe('requireJwtSecret', () => {
  it('should accept the generated form, 64 hex characters', () => {
    const secret = randomBytes(32).toString('hex');
    expect(requireJwtSecret('JWT_USER_SECRET', secret)).toBe(secret);
  });

  it('should accept upper-case hex', () => {
    expect(() => requireJwtSecret('X', 'AB'.repeat(32))).not.toThrow();
  });

  it.each([undefined, '', '   '])(
    'should name a missing secret %p',
    (value) => {
      expect(() => requireJwtSecret('JWT_SERVICE_SECRET', value)).toThrow(
        'JWT_SERVICE_SECRET is not defined in environment variables',
      );
    },
  );

  // Les exemples d'origine des .env.example ressemblaient aux deux premiers.
  it.each([
    [
      'a short passphrase',
      'super-secret-service',
      '20 characters, not all hex',
    ],
    [
      'a long passphrase',
      'ceci-est-mon-mot-de-passe-de-prod',
      '33 characters, not all hex',
    ],
    ['32 hex characters', 'ab'.repeat(16), '32 characters ('],
    ['66 hex characters', 'ab'.repeat(33), '66 characters ('],
  ])('should refuse %s, saying why and never quoting it', (_l, bad, why) => {
    expect(() => requireJwtSecret('JWT_SERVICE_SECRET', bad)).toThrow(
      `JWT_SERVICE_SECRET must be 64 hex characters, got ${why}`,
    );
    let message = '';
    try {
      requireJwtSecret('JWT_SERVICE_SECRET', bad);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain(bad);
  });
});
