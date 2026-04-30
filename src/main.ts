import { NestFactory } from '@nestjs/core';
import { LOG_LEVELS, Logger, LogLevel, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';

async function bootstrap() {
  const isProduction = process.env.NODE_ENV === 'production';

  /* ********************************************** */

  const logger = new Logger('bootstrap');

  // Ex: LOG_LEVELS=error,warn,log,debug
  const envLogLevels = process.env.LOG_LEVELS;

  const defaultLevels: LogLevel[] = isProduction
    ? ['error', 'warn']
    : ['log', 'debug', 'warn', 'error', 'verbose'];

  const levels: LogLevel[] = envLogLevels
    ? envLogLevels
        .split(',')
        .map((item) => item.trim().toLowerCase() as LogLevel)
        .filter((level) => LOG_LEVELS.includes(level))
    : defaultLevels;

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: levels.length > 0 ? levels : defaultLevels,
  });

  const configService = app.get(ConfigService);

  /* ********************************************** */

  const origins = configService
    .get<string>('CORS_ORIGINS')
    ?.split(',')
    .map((origin) => origin.trim());

  const corsOptions: CorsOptions = {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) return callback(null, true);

      if (origins?.includes(origin)) {
        return callback(null, true);
      }

      return callback(null, false);
    },
    credentials: true,
  };

  app.enableCors(corsOptions);

  /* ********************************************** */

  // C'est cette ligne qui active la magie de class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Supprime les propriétés non définies dans le DTO
      forbidNonWhitelisted: true, // Rejette les requêtes avec des propriétés inconnues
      transform: true, // Transforme les types (ex: string en number si demandé)
    }),
  );

  /* ********************************************** */

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');

  logger.warn(`\uf427  App running on port ${port} (internal)`);
}
bootstrap().catch((err) => {
  console.error(err);
});
