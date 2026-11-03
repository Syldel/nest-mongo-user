import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import {
  LoginThrottledError,
  LoginThrottleService,
} from './login-throttle/login-throttle.service';
import { inMemoryLoginThrottleModel } from '../testing/in-memory-login-throttle-model';

// `compare` est observé sans être remplacé : un espion posé sur l'import du
// spec ne verrait pas les appels du service, qui a sa propre copie du module.
jest.mock('bcrypt', () => {
  const actual = jest.requireActual<typeof bcrypt>('bcrypt');
  return {
    ...actual,
    compare: jest.fn().mockImplementation(actual.compare),
  };
});

const SECRET = 'a1'.repeat(32);
const PASSWORD = 'correct horse battery';

function usersServiceStub(
  overrides: Partial<Record<keyof UsersService, jest.Mock>> = {},
) {
  return {
    findOneByWallet: jest.fn().mockResolvedValue(null),
    findOneByUsername: jest.fn().mockResolvedValue(null),
    findOneByUsernameForAuth: jest.fn().mockResolvedValue(null),
    findOneByWalletForAuth: jest.fn().mockResolvedValue(null),
    findByIdForAuth: jest.fn().mockResolvedValue(null),
    create: jest.fn((data: Partial<User>) => Promise.resolve(data)),
    ...overrides,
  };
}

function serviceWith(
  users: ReturnType<typeof usersServiceStub>,
  throttle = new LoginThrottleService(inMemoryLoginThrottleModel().model),
) {
  return new AuthService(
    users as unknown as UsersService,
    new JwtService({ secret: SECRET }),
    throttle,
  );
}

describe('AuthService', () => {
  let storedHash: string;
  afterEach(() => jest.clearAllMocks());
  beforeAll(async () => {
    storedHash = await bcrypt.hash(PASSWORD, 4);
  });

  describe('register', () => {
    const dto = {
      walletAddress: ' 0x' + 'a'.repeat(40) + ' ',
      username: ' Alice ',
      password: PASSWORD,
    };

    it('should store a bcrypt hash, never the password itself', async () => {
      const users = usersServiceStub();
      await serviceWith(users).register(dto);

      const [[saved]] = users.create.mock.calls as Partial<User>[][];
      expect(saved.password).not.toBe(PASSWORD);
      await expect(bcrypt.compare(PASSWORD, saved.password!)).resolves.toBe(
        true,
      );
    });

    it('should trim the wallet and lower-case the username', async () => {
      const users = usersServiceStub();
      await serviceWith(users).register(dto);

      expect(users.create).toHaveBeenCalledWith(
        expect.objectContaining({
          walletAddress: '0x' + 'a'.repeat(40),
          username: 'alice',
        }),
      );
    });

    it.each([
      ['wallet', 'findOneByWallet'],
      ['username', 'findOneByUsername'],
    ] as const)('should refuse an already used %s', async (_label, lookup) => {
      const users = usersServiceStub({
        [lookup]: jest.fn().mockResolvedValue({ _id: 'existing' }),
      });

      await expect(serviceWith(users).register(dto)).rejects.toThrow(
        ConflictException,
      );
      expect(users.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const user = {
      _id: { toString: () => 'user-1' },
      walletAddress: '0xabc',
      username: 'alice',
      password: '',
    };
    beforeEach(() => {
      user.password = storedHash;
    });

    it('should issue a token naming the user, without the password hash', async () => {
      const users = usersServiceStub({
        findOneByUsernameForAuth: jest.fn().mockResolvedValue(user),
      });
      const { access_token } = await serviceWith(users).login({
        username: 'alice',
        password: PASSWORD,
      });

      const payload = new JwtService().verify<Record<string, unknown>>(
        access_token,
        { secret: SECRET },
      );
      expect(payload).toMatchObject({
        sub: 'user-1',
        wallet: '0xabc',
        username: 'alice',
      });
      expect(JSON.stringify(payload)).not.toContain(storedHash);
    });

    // Même réponse pour un compte inconnu et un mauvais mot de passe : la
    // différence dirait quels comptes existent.
    it.each([
      ['an unknown username', null, PASSWORD],
      ['a wrong password', user, 'wrong password'],
    ])('should answer "Invalid credentials" for %s', async (_l, found, pwd) => {
      const users = usersServiceStub({
        findOneByUsernameForAuth: jest.fn().mockResolvedValue(found),
      });

      await expect(
        serviceWith(users).login({ username: 'alice', password: pwd }),
      ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
    });

    // Un compte inconnu doit coûter un calcul bcrypt, au même coût qu'un vrai
    // hash : sans lui, il répondait plus vite et le temps disait quels comptes
    // existent.
    it('should run bcrypt at the register cost even for an unknown account', async () => {
      const users = usersServiceStub();
      await expect(
        serviceWith(users).login({ username: 'ghost', password: PASSWORD }),
      ).rejects.toThrow(UnauthorizedException);

      const compare = bcrypt.compare as unknown as jest.Mock;
      expect(compare).toHaveBeenCalledTimes(1);
      const [, hash] = compare.mock.calls[0] as [string, string];

      await serviceWith(users).register({
        walletAddress: '0x' + 'a'.repeat(40),
        username: 'alice',
        password: PASSWORD,
      });
      const [[created]] = users.create.mock.calls as Partial<User>[][];
      expect(bcrypt.getRounds(hash)).toBe(bcrypt.getRounds(created.password!));
    });

    it('should refuse a login naming neither a username nor a wallet', async () => {
      await expect(
        serviceWith(usersServiceStub()).login({ password: PASSWORD }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  /**
   * La limitation vue depuis le login : un compteur par compte, partagé par
   * le nom et le wallet, et le même comportement pour un compte inconnu.
   */
  describe('login throttling', () => {
    const account = {
      _id: { toString: () => 'user-1' },
      walletAddress: '0x' + 'a'.repeat(40),
      username: 'alice',
      password: '',
    };
    beforeEach(() => {
      account.password = storedHash;
    });

    const outcome = (promise: Promise<unknown>) =>
      promise.then(
        () => 'ok',
        (e: Error) => e.name,
      );

    async function sixthOutcome(
      service: AuthService,
      dto: { username?: string; walletAddress?: string },
    ) {
      for (let i = 0; i < 5; i++) {
        await outcome(service.login({ ...dto, password: 'wrong password' }));
      }
      return outcome(service.login({ ...dto, password: 'wrong password' }));
    }

    // Si un compte inconnu n'était pas limité, le sixième essai dirait si le
    // compte existe : 401 pour l'un, 429 pour l'autre.
    it('should throttle an unknown account exactly like a known one', async () => {
      const known = serviceWith(
        usersServiceStub({
          findOneByUsernameForAuth: jest.fn().mockResolvedValue(account),
        }),
      );
      const unknown = serviceWith(usersServiceStub());

      await expect(sixthOutcome(known, { username: 'alice' })).resolves.toBe(
        'LoginThrottledError',
      );
      await expect(sixthOutcome(unknown, { username: 'ghost' })).resolves.toBe(
        'LoginThrottledError',
      );
    });

    it('should share one counter between the username and the wallet of an account', async () => {
      const service = serviceWith(
        usersServiceStub({
          findOneByUsernameForAuth: jest.fn().mockResolvedValue(account),
          findOneByWalletForAuth: jest.fn().mockResolvedValue(account),
        }),
      );
      for (let i = 0; i < 5; i++) {
        await outcome(
          service.login({ username: 'alice', password: 'wrong password' }),
        );
      }

      await expect(
        outcome(
          service.login({
            walletAddress: account.walletAddress,
            password: PASSWORD,
          }),
        ),
      ).resolves.toBe('LoginThrottledError');
    });

    it('should refuse even the right password during a wait', async () => {
      const service = serviceWith(
        usersServiceStub({
          findOneByUsernameForAuth: jest.fn().mockResolvedValue(account),
        }),
      );
      await sixthOutcome(service, { username: 'alice' });

      await expect(
        outcome(service.login({ username: 'alice', password: PASSWORD })),
      ).resolves.toBe('LoginThrottledError');
    });
  });

  describe('changePassword', () => {
    function storedUser() {
      return {
        _id: { toString: () => 'user-1' },
        password: storedHash,
        save: jest.fn().mockResolvedValue({}),
      };
    }

    it('should save a hash of the new password', async () => {
      const user = storedUser();
      const users = usersServiceStub({
        findByIdForAuth: jest.fn().mockResolvedValue(user),
      });

      await serviceWith(users).changePassword('u1', {
        currentPassword: PASSWORD,
        newPassword: 'brand new password',
        confirmPassword: 'brand new password',
      });

      expect(user.save).toHaveBeenCalled();
      expect(user.password).not.toBe('brand new password');
      await expect(
        bcrypt.compare('brand new password', user.password),
      ).resolves.toBe(true);
    });

    it('should refuse a wrong current password and save nothing', async () => {
      const user = storedUser();
      const users = usersServiceStub({
        findByIdForAuth: jest.fn().mockResolvedValue(user),
      });

      await expect(
        serviceWith(users).changePassword('u1', {
          currentPassword: 'not the password',
          newPassword: 'brand new password',
          confirmPassword: 'brand new password',
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(user.save).not.toHaveBeenCalled();
      expect(user.password).toBe(storedHash);
    });

    // Un jeton volé ne doit pas servir à deviner le mot de passe actuel.
    it('should throttle wrong current passwords like failed sign-ins', async () => {
      const user = storedUser();
      const service = serviceWith(
        usersServiceStub({
          findByIdForAuth: jest.fn().mockResolvedValue(user),
        }),
      );
      const dto = {
        currentPassword: 'not the password',
        newPassword: 'brand new password',
        confirmPassword: 'brand new password',
      };
      for (let i = 0; i < 5; i++) {
        await service.changePassword('u1', dto).catch(() => undefined);
      }

      await expect(service.changePassword('u1', dto)).rejects.toThrow(
        LoginThrottledError,
      );
    });

    it('should refuse a confirmation that differs', async () => {
      await expect(
        serviceWith(usersServiceStub()).changePassword('u1', {
          currentPassword: PASSWORD,
          newPassword: 'brand new password',
          confirmPassword: 'brand new passwort',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
