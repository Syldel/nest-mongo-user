import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { StringValue } from 'ms';
import { ServiceAuthGuard } from './service-auth.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => {
        const secret = config.get<string>('JWT_SERVICE_SECRET');
        const expiresIn = config.get<string>('JWT_EXPIRES_IN') || '3600s';

        if (!secret) {
          throw new Error(
            'JWT_SERVICE_SECRET is not defined in environment variables',
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
  ],
  providers: [ServiceAuthGuard],
  exports: [JwtModule, ServiceAuthGuard],
})
export class ServiceAuthModule {}
