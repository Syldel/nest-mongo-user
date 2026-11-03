import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { StringValue } from 'ms';
import { JWT_ALGORITHM, requireJwtSecret } from './jwt-secret';

import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => {
        const secret = requireJwtSecret(
          'JWT_USER_SECRET',
          config.get<string>('JWT_USER_SECRET'),
        );
        const expiresIn = config.get<string>('JWT_EXPIRES_IN') || '3600s';

        return {
          secret: secret,
          signOptions: {
            algorithm: JWT_ALGORITHM,
            expiresIn: expiresIn as StringValue,
          },
          verifyOptions: { algorithms: [JWT_ALGORITHM] },
        };
      },
    }),
    UsersModule,
  ],
  providers: [AuthService, AuthGuard],
  exports: [JwtModule],
  controllers: [AuthController],
})
export class AuthModule {}
