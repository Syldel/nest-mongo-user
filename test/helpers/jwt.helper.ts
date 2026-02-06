import { JwtService } from '@nestjs/jwt';

export function generateUserToken(jwtSecret: string) {
  const jwt = new JwtService({ secret: jwtSecret });

  return jwt.sign({
    sub: 'user-id-123',
    wallet: '0x123',
    username: 'testuser',
  });
}

export function generateServiceToken(
  jwtSecret: string,
  scope: string[] = ['users:read'],
) {
  const jwt = new JwtService({ secret: jwtSecret });

  return jwt.sign({
    service: 'nest-trading-bot',
    scope,
  });
}

export function generateExpiredUserToken(jwtSecret: string) {
  const jwt = new JwtService({ secret: jwtSecret });

  return jwt.sign(
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
