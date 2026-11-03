import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ChangePasswordDto, LoginDto, RegisterDto } from './auth.dto';

// Transforme puis valide un corps de requête, comme le ValidationPipe de
// main.ts : renvoie les propriétés refusées.
function rejectedFields(body: Record<string, unknown>): string[] {
  const dto = plainToInstance(RegisterDto, body);
  return validateSync(dto).map((e) => e.property);
}

const valid = {
  walletAddress: '0x' + 'aB'.repeat(20),
  username: 'alice_01',
  password: 'correct horse battery',
};

describe('RegisterDto', () => {
  it('should accept a well-formed registration', () => {
    expect(rejectedFields(valid)).toEqual([]);
  });

  it.each([
    ['without the 0x prefix', 'a'.repeat(40)],
    ['one character short', '0x' + 'a'.repeat(39)],
    ['with a non-hex character', '0x' + 'a'.repeat(39) + 'g'],
  ])('should refuse a wallet address %s', (_label, walletAddress) => {
    expect(rejectedFields({ ...valid, walletAddress })).toEqual([
      'walletAddress',
    ]);
  });

  it.each(['ab', 'a'.repeat(21), 'al__ice', 'al ice', '_alice'])(
    'should refuse the username %j',
    (username) => {
      expect(rejectedFields({ ...valid, username })).toEqual(['username']);
    },
  );

  // NIST SP 800-63B-4 : 15 caractères pour un facteur unique.
  it.each([
    ['14 characters', 'a'.repeat(14), ['password']],
    ['15 characters', 'a'.repeat(15), []],
    // Un point de code compte pour un : 15 emojis font 30 unités UTF-16.
    ['15 emojis', '🚀'.repeat(15), []],
    ['14 emojis', '🚀'.repeat(14), ['password']],
  ])('should treat a password of %s', (_label, password, expected) => {
    expect(rejectedFields({ ...valid, password })).toEqual(expected);
  });

  it('should say how long a password must be', () => {
    const dto = plainToInstance(RegisterDto, { ...valid, password: 'short' });
    const [error] = validateSync(dto);
    expect(Object.values(error.constraints ?? {})).toContain(
      'Password must be at least 15 characters long',
    );
  });
});

// bcrypt ne lit que 72 octets : au-delà, la fin du mot de passe ne compte pas.
describe('password length in bytes', () => {
  const refused = (cls: new () => object, body: Record<string, unknown>) =>
    validateSync(plainToInstance(cls, body)).map((e) => e.property);

  it.each([
    ['72 ASCII bytes', 'a'.repeat(72), []],
    ['73 ASCII bytes', 'a'.repeat(73), ['password']],
    ['36 « é », 72 bytes', 'é'.repeat(36), []],
    ['37 « é », 74 bytes', 'é'.repeat(37), ['password']],
  ])('should treat a register password of %s', (_label, password, expected) => {
    expect(refused(RegisterDto, { ...valid, password })).toEqual(expected);
  });

  it('should refuse a login password above 72 bytes', () => {
    expect(
      refused(LoginDto, { username: 'alice', password: 'a'.repeat(73) }),
    ).toEqual(['password']);
  });

  it('should require 15 characters for a new password too', () => {
    const short = 'a'.repeat(14);
    expect(
      refused(ChangePasswordDto, {
        currentPassword: 'old-password',
        newPassword: short,
        confirmPassword: short,
      }),
    ).toEqual(['newPassword']);
  });

  // Une connexion n'impose pas de minimum : un mot de passe d'avant la
  // règle des 15 caractères doit rester utilisable.
  it('should accept a short password at sign-in', () => {
    expect(
      refused(LoginDto, { username: 'alice', password: 'short-pass' }),
    ).toEqual([]);
  });

  it('should refuse a new password above 72 bytes', () => {
    const long = 'a'.repeat(73);
    expect(
      refused(ChangePasswordDto, {
        currentPassword: 'old-password',
        newPassword: long,
        confirmPassword: long,
      }),
    ).toEqual(['newPassword']);
  });
});
