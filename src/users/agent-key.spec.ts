import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { JweUtil } from '@syldel/crypto-utils';
import { randomBytes } from 'crypto';
import { agentKeyContext, readStoredAgentKey } from './agent-key';

describe('agentKeyContext', () => {
  // Le gateway ouvre la clé avec exactement cette chaîne : la changer ici
  // sans la changer là-bas rendrait toutes les clés illisibles.
  it('should bind the key to the user id, in the format the gateway expects', () => {
    expect(agentKeyContext('6650a1b2c3d4e5f6a7b8c9d0')).toBe(
      'hl-agent-key:6650a1b2c3d4e5f6a7b8c9d0',
    );
  });

  // Ce que set-agent-key écrit, relu comme le gateway le relira.
  it('should let a key sealed for one user open only for that user', () => {
    const key = randomBytes(32);
    const sealed = JweUtil.seal('0x' + 'ab'.repeat(32), {
      kid: '2026-11',
      key,
      context: agentKeyContext('user-a'),
    });
    const keys = { '2026-11': key };

    expect(
      JweUtil.open(sealed, { keys, context: agentKeyContext('user-a') }),
    ).toBe('0x' + 'ab'.repeat(32));
    expect(() =>
      JweUtil.open(sealed, { keys, context: agentKeyContext('user-b') }),
    ).toThrow('Context mismatch');
  });
});

describe('readStoredAgentKey', () => {
  it('should return a stored JWE string as is', () => {
    expect(readStoredAgentKey('a..b.c.d')).toBe('a..b.c.d');
  });

  it.each([undefined, null])('should answer 404 for %p', (stored) => {
    expect(() => readStoredAgentKey(stored)).toThrow(NotFoundException);
  });

  // Mesuré avec Mongoose 9.3.0 : sous un chemin `String`, cet objet se lisait
  // `undefined`, et la réponse aurait été « aucune clé » au lieu de ceci.
  it('should name the crypto-utils 1.x format instead of answering 404', () => {
    expect(() =>
      readStoredAgentKey({ data: 'aa', iv: 'bb', tag: 'cc' }),
    ).toThrow(ConflictException);
  });

  it.each([42, ['a'], { other: true }])(
    'should refuse the unexpected value %p',
    (stored) => {
      expect(() => readStoredAgentKey(stored)).toThrow(
        InternalServerErrorException,
      );
    },
  );
});
