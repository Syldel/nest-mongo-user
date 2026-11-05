import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Request } from 'express';
import { UsersService } from '../users/users.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

/**
 * Les gardes posés sur une route. La méthode est lue par son descripteur et
 * jamais appelée : seule la fonction porte les métadonnées. L'accès direct
 * `AuthController.prototype[method]` est signalé par `unbound-method` depuis
 * typescript-eslint 8.72, qui ne peut pas savoir que rien ne l'appelle.
 */
function guardsOf(method: keyof AuthController): unknown[] {
  const handler: unknown = Object.getOwnPropertyDescriptor(
    AuthController.prototype,
    method,
  )?.value;
  return (Reflect.getMetadata(GUARDS_METADATA, handler as object) ??
    []) as unknown[];
}

describe('AuthController', () => {
  describe('route protection', () => {
    it.each(['changePassword', 'getProfile', 'updateMyStrategy'] as const)(
      'should require a user token on %s',
      (method) => {
        expect(guardsOf(method)).toEqual([AuthGuard]);
      },
    );

    it.each(['register', 'login'] as const)(
      'should leave %s open',
      (method) => {
        expect(guardsOf(method)).toEqual([]);
      },
    );
  });

  describe('production locks', () => {
    const previousEnv = process.env.NODE_ENV;
    const authService = {
      register: jest.fn(),
      changePassword: jest.fn(),
    };
    const controller = new AuthController(
      authService as unknown as AuthService,
      {} as UsersService,
    );

    beforeEach(() => {
      process.env.NODE_ENV = 'production';
      jest.clearAllMocks();
    });
    afterEach(() => {
      process.env.NODE_ENV = previousEnv;
    });

    it('should refuse registration in production', async () => {
      await expect(
        controller.register({
          walletAddress: '0x' + 'a'.repeat(40),
          username: 'alice',
          password: 'password123',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(authService.register).not.toHaveBeenCalled();
    });

    it('should refuse a password change in production', async () => {
      const request = { user: { id: 'u1' } } as Request;
      await expect(
        controller.changePassword(request, {
          currentPassword: 'old-password',
          newPassword: 'new-password',
          confirmPassword: 'new-password',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(authService.changePassword).not.toHaveBeenCalled();
    });
  });

  // L'utilisateur visé vient toujours du jeton, jamais du corps de requête.
  it('should change the password of the token holder only', async () => {
    const authService = { changePassword: jest.fn().mockResolvedValue({}) };
    const controller = new AuthController(
      authService as unknown as AuthService,
      {} as UsersService,
    );
    const dto = {
      currentPassword: 'old-password',
      newPassword: 'new-password',
      confirmPassword: 'new-password',
    };

    await controller.changePassword({ user: { id: 'u1' } } as Request, dto);

    expect(authService.changePassword).toHaveBeenCalledWith('u1', dto);
  });
});
