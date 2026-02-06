import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { StringValue } from 'ms';

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
        const secret = config.get<string>('JWT_USER_SECRET');
        const expiresIn = config.get<string>('JWT_EXPIRES_IN') || '3600s';

        if (!secret) {
          throw new Error(
            'JWT_USER_SECRET is not defined in environment variables',
          );
        }

        return {
          secret: secret,
          signOptions: {
            expiresIn: expiresIn as StringValue,
          },
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
