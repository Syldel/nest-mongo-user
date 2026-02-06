import { JwtService } from '@nestjs/jwt';

const jwt = new JwtService({
  secret: process.env.JWT_SERVICE_SECRET,
});

const token = jwt.sign(
  {
    service: 'nest-trading-bot',
    scope: ['users:read'],
  },
  {
    expiresIn: '1h',
  },
);

console.log(token);
