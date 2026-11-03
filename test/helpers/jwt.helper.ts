import { JwtService } from '@nestjs/jwt';
import { JwtServicePayload } from '../../src/auth/interfaces/jwt-service-payload.interface';
import { JwtUserPayload } from '../../src/auth/interfaces/jwt-user-payload.interface';

export function generateUserToken(jwtSecret: string) {
  const jwt = new JwtService({ secret: jwtSecret });

  return jwt.sign<JwtUserPayload>(
    {
      sub: 'user-id-123',
      wallet: '0x123',
      username: 'testuser',
    },
    // Les gardes refusent un jeton sans `exp`.
    { expiresIn: '60s' },
  );
}

export function generateServiceToken(
  jwtSecret: string,
  scope: string[] = ['users:read'],
) {
  const jwt = new JwtService({ secret: jwtSecret });

  return jwt.sign<JwtServicePayload>(
    {
      sub: 'nest-trading-bot',
      scope,
    },
    { expiresIn: '60s' },
  );
}

export function generateExpiredUserToken(jwtSecret: string) {
  const jwt = new JwtService({ secret: jwtSecret });

  return jwt.sign<JwtUserPayload>(
    {
      sub: 'expired-user',
      wallet: '0x123',
      username: 'testuser',
    },
    {
      expiresIn: '-10s',
    },
  );
}
