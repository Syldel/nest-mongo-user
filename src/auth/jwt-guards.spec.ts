import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AuthGuard } from './auth.guard';
import { ServiceAuthGuard } from './service-auth.guard';

const USER_SECRET = 'user-secret-for-tests';
const SERVICE_SECRET = 'service-secret-for-tests';

function httpContext(request: Partial<Request>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function bearer(token: string): Partial<Request> {
  return { headers: { authorization: `Bearer ${token}` } };
}

// Un JWT `alg: none` : en-tête et charge valides, signature vide.
function unsignedToken(payload: object): string {
  const encode = (part: object) =>
    Buffer.from(JSON.stringify(part)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.`;
}

// Les gardes reçoivent le JwtService de leur module, mais passent toujours leur
// propre secret à `verifyAsync` : on leur donne ici un JwtService sans secret
// par défaut, pour qu'aucun repli silencieux ne fasse passer un test.
const jwt = new JwtService();
const config = {
  get: (key: string) =>
    ({ JWT_USER_SECRET: USER_SECRET, JWT_SERVICE_SECRET: SERVICE_SECRET })[key],
} as unknown as ConfigService;

const userPayload = { sub: 'user-1', wallet: '0xabc', username: 'alice' };
const servicePayload = {
  sub: 'nest-hyperliquid-gateway',
  scope: ['users:read', 'users:agentKey'],
};

describe('AuthGuard (user tokens)', () => {
  const guard = new AuthGuard(jwt, config);

  it('should put the token identity on the request', async () => {
    const token = jwt.sign(userPayload, { secret: USER_SECRET });
    const request = bearer(token);

    await expect(guard.canActivate(httpContext(request))).resolves.toBe(true);
    expect(request.user).toEqual({
      id: 'user-1',
      wallet: '0xabc',
      username: 'alice',
    });
  });

  it.each([
    ['no Authorization header', { headers: {} }],
    ['a non-Bearer scheme', { headers: { authorization: 'Basic abc' } }],
  ])('should refuse %s', async (_label, request) => {
    await expect(guard.canActivate(httpContext(request))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  // Les deux familles de jetons ne doivent jamais s'échanger : un jeton de
  // service présenté comme jeton utilisateur, ou l'inverse, est refusé.
  it('should refuse a service token', async () => {
    const token = jwt.sign(servicePayload, { secret: SERVICE_SECRET });
    await expect(guard.canActivate(httpContext(bearer(token)))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should refuse an expired token', async () => {
    const token = jwt.sign(userPayload, {
      secret: USER_SECRET,
      expiresIn: -10,
    });
    await expect(guard.canActivate(httpContext(bearer(token)))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should refuse an unsigned alg:none token', async () => {
    const token = unsignedToken(userPayload);
    await expect(guard.canActivate(httpContext(bearer(token)))).rejects.toThrow(
      UnauthorizedException,
    );
  });
});

describe('ServiceAuthGuard (service tokens)', () => {
  const guard = new ServiceAuthGuard(jwt, config);

  it('should put the service identity and scope on the request', async () => {
    const token = jwt.sign(servicePayload, { secret: SERVICE_SECRET });
    const request = bearer(token);

    await expect(guard.canActivate(httpContext(request))).resolves.toBe(true);
    expect(request.service).toEqual({
      id: 'nest-hyperliquid-gateway',
      scope: ['users:read', 'users:agentKey'],
    });
  });

  it('should refuse a request without a token', async () => {
    await expect(
      guard.canActivate(httpContext({ headers: {} })),
    ).rejects.toThrow(UnauthorizedException);
  });

  // Un utilisateur connecté ne doit pas pouvoir lire la clé d'agent en
  // présentant son propre jeton sur une route interne.
  it('should refuse a user token', async () => {
    const token = jwt.sign(
      { ...userPayload, scope: ['users:agentKey'] },
      { secret: USER_SECRET },
    );
    await expect(guard.canActivate(httpContext(bearer(token)))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should refuse an expired token', async () => {
    const token = jwt.sign(servicePayload, {
      secret: SERVICE_SECRET,
      expiresIn: -10,
    });
    await expect(guard.canActivate(httpContext(bearer(token)))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should refuse an unsigned alg:none token', async () => {
    const token = unsignedToken(servicePayload);
    await expect(guard.canActivate(httpContext(bearer(token)))).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
