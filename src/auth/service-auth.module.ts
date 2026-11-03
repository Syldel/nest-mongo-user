import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { StringValue } from 'ms';
import { JWT_ALGORITHM, requireJwtSecret } from './jwt-secret';
import { ServiceAuthGuard } from './service-auth.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => {
        const secret = requireJwtSecret(
          'JWT_SERVICE_SECRET',
          config.get<string>('JWT_SERVICE_SECRET'),
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
  ],
  providers: [ServiceAuthGuard],
  exports: [JwtModule, ServiceAuthGuard],
})
export class ServiceAuthModule {}
