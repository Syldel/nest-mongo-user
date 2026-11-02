import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { ServiceScopeGuard } from './service-scope.guard';

function httpContext(request: Partial<Request>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('ServiceScopeGuard', () => {
  const guard = new ServiceScopeGuard('users:agentKey');

  it('should refuse a request that no service guard authenticated', () => {
    expect(() => guard.canActivate(httpContext({}))).toThrow(
      UnauthorizedException,
    );
  });

  it('should refuse a service without the required scope', () => {
    const request = { service: { id: 'bot', scope: ['users:read'] } };
    expect(() => guard.canActivate(httpContext(request))).toThrow(
      ForbiddenException,
    );
  });

  it('should refuse a service with no scope at all', () => {
    const request = { service: { id: 'bot' } } as unknown as Partial<Request>;
    expect(() => guard.canActivate(httpContext(request))).toThrow(
      ForbiddenException,
    );
  });

  it('should let through a service holding the required scope', () => {
    const request = {
      service: { id: 'gateway', scope: ['users:read', 'users:agentKey'] },
    };
    expect(guard.canActivate(httpContext(request))).toBe(true);
  });

  // Le scope vient d'un JWT : rien ne garantit que ce soit un tableau. Sur une
  // chaîne, `includes` cherche une sous-chaîne, et « users:agentKeys » ou
  // « users:read users:agentKey » ouvraient la clé d'agent.
  it.each(['users:agentKey', 'users:agentKeys', 'users:read users:agentKey'])(
    'should refuse a scope sent as the string %j instead of an array',
    (scope) => {
      const request = {
        service: { id: 'gateway', scope },
      } as unknown as Partial<Request>;
      expect(() => guard.canActivate(httpContext(request))).toThrow(
        ForbiddenException,
      );
    },
  );
});
