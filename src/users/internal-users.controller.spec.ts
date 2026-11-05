import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
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
  // Par le descripteur, pas par `prototype[method]` : la méthode n'est jamais
  // appelée, et typescript-eslint ≥ 8.72 signale cet accès (`unbound-method`).
  const handler: unknown = Object.getOwnPropertyDescriptor(
    InternalUsersController.prototype,
    method,
  )?.value;
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
    // Un JWE compact tel que `JweUtil.seal` l'écrit : la route ne l'ouvre pas.
    const agentKey = 'eyJhbGciOiJkaXIifQ..aXY.Y3Q.dGFn';

    function controllerReturning(user: unknown) {
      const usersService = {
        findByIdWithAgentKey: jest.fn().mockResolvedValue(user),
      } as unknown as UsersService;
      return new InternalUsersController(usersService);
    }

    // Un objet et non la chaîne nue : Nest enverrait une chaîne en text/html,
    // et le gateway lit `response.json()`.
    const agent = {
      address: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
      name: 'bot_main',
      validUntil: new Date('2027-05-04T11:00:28Z'),
      keyUpdatedAt: new Date('2026-11-05T11:05:00Z'),
    };

    it('should return the sealed key as is and its public data, inside a JSON object', async () => {
      const controller = controllerReturning({ agentKey, agent });
      await expect(controller.getAgentCredentials('u1')).resolves.toEqual({
        agentKey,
        agent,
      });
    });

    // Une clé enregistrée avant qu'on demande son expiration : la route la
    // sert, et c'est le gateway qui refuse de signer en le nommant.
    it('should answer agent: null for a key stored without its data', async () => {
      const controller = controllerReturning({ agentKey });
      await expect(controller.getAgentCredentials('u1')).resolves.toEqual({
        agentKey,
        agent: null,
      });
    });

    it('should refuse malformed agent data instead of guessing', async () => {
      const controller = controllerReturning({
        agentKey,
        agent: { ...agent, validUntil: 'soon' },
      });
      await expect(controller.getAgentCredentials('u1')).rejects.toThrow(
        'The stored agent data has an unexpected shape: run set-agent-key again',
      );
    });

    it('should name a key still stored in the crypto-utils 1.x format', async () => {
      const controller = controllerReturning({
        agentKey: { data: 'aa', iv: 'bb', tag: 'cc' },
      });
      await expect(controller.getAgentCredentials('u1')).rejects.toThrow(
        new ConflictException(
          'The stored agent key uses the crypto-utils 1.x format { data, iv, tag }: run set-agent-key again',
        ),
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
