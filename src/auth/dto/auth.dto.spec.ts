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
  password: 'password123',
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

  it('should refuse a password under 8 characters', () => {
    expect(rejectedFields({ ...valid, password: 'short12' })).toEqual([
      'password',
    ]);
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
