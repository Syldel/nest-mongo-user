import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ServiceAuthGuard } from '../auth/service-auth.guard';
import { ServiceScopeGuard } from '../auth/service-scope.guard';
import { InternalUsersController } from './internal-users.controller';
import { UsersService } from './users.service';

/**
 * Ce que `@ServiceAccess` a posé sur une route : le garde d'authentification
 * de service, puis les scopes exigés, dans l'ordre.
 */
function routeAccess(method: keyof InternalUsersController) {
  const handler: unknown = InternalUsersController.prototype[method];
  const guards = (Reflect.getMetadata(GUARDS_METADATA, handler as object) ??
    []) as unknown[];
  return {
    authenticated: guards[0] === ServiceAuthGuard,
    scopes: guards
      .filter((g): g is ServiceScopeGuard => g instanceof ServiceScopeGuard)
      .map((g) => (g as unknown as { requiredScope: string }).requiredScope),
  };
}

describe('InternalUsersController', () => {
  describe('route protection', () => {
    // La seule route qui sert la clé d'agent chiffrée : elle doit exiger les
    // deux scopes, et pas seulement `users:read` que le bot détient.
    it('should require users:read and users:agentKey for agent credentials', () => {
      expect(routeAccess('getAgentCredentials')).toEqual({
        authenticated: true,
        scopes: ['users:read', 'users:agentKey'],
      });
    });

    it('should require users:read to list users', () => {
      expect(routeAccess('findAllUsers')).toEqual({
        authenticated: true,
        scopes: ['users:read'],
      });
    });

    it('should require users:write to delete a user', () => {
      expect(routeAccess('deleteByWallet')).toEqual({
        authenticated: true,
        scopes: ['users:write'],
      });
    });
  });

  describe('getAgentCredentials', () => {
    const agentKey = { data: 'aa', iv: 'bb', tag: 'cc' };

    function controllerReturning(user: unknown) {
      const usersService = {
        findByIdWithAgentKey: jest.fn().mockResolvedValue(user),
      } as unknown as UsersService;
      return new InternalUsersController(usersService);
    }

    it('should return the stored encrypted blob as is', async () => {
      const controller = controllerReturning({ agentKey });
      await expect(controller.getAgentCredentials('u1')).resolves.toEqual(
        agentKey,
      );
    });

    it.each([
      ['an unknown user', null],
      ['a user without an agent key', { agentKey: undefined }],
    ])('should answer 404 for %s', async (_label, user) => {
      const controller = controllerReturning(user);
      await expect(controller.getAgentCredentials('u1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteByWallet', () => {
    const previousEnv = process.env.NODE_ENV;
    afterEach(() => {
      process.env.NODE_ENV = previousEnv;
    });

    it('should refuse to delete in production', () => {
      process.env.NODE_ENV = 'production';
      const usersService = { deleteByWallet: jest.fn() };
      const controller = new InternalUsersController(
        usersService as unknown as UsersService,
      );

      expect(() => controller.deleteByWallet('0xabc')).toThrow(
        ForbiddenException,
      );
      expect(usersService.deleteByWallet).not.toHaveBeenCalled();
    });
  });
});
