import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RegisterDto } from './auth.dto';

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
