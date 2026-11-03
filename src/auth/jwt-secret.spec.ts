import { MIN_SECRET_BYTES, requireJwtSecret } from './jwt-secret';

describe('requireJwtSecret', () => {
  it('should accept a 64-hex secret, the generated form', () => {
    const secret = 'ab'.repeat(32);
    expect(requireJwtSecret('JWT_USER_SECRET', secret)).toBe(secret);
  });

  it(`should accept exactly ${MIN_SECRET_BYTES} bytes`, () => {
    expect(() => requireJwtSecret('X', 'x'.repeat(32))).not.toThrow();
  });

  it.each([undefined, '', '   '])(
    'should name a missing secret %p',
    (value) => {
      expect(() => requireJwtSecret('JWT_SERVICE_SECRET', value)).toThrow(
        'JWT_SERVICE_SECRET is not defined in environment variables',
      );
    },
  );

  // Les exemples d'origine ressemblaient à ceci : une phrase, pas une clé.
  it('should refuse a short secret, saying its length and never its value', () => {
    const short = 'super-secret-service';
    expect(() => requireJwtSecret('JWT_SERVICE_SECRET', short)).toThrow(
      'JWT_SERVICE_SECRET is too short: 20 bytes, at least 32 required',
    );
    let message = '';
    try {
      requireJwtSecret('JWT_SERVICE_SECRET', short);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain(short);
  });

  it('should count bytes, not characters', () => {
    // 16 « é » font 16 caractères mais 32 octets UTF-8.
    expect(() => requireJwtSecret('X', 'é'.repeat(16))).not.toThrow();
    expect(() => requireJwtSecret('X', 'é'.repeat(15))).toThrow('30 bytes');
  });
});
