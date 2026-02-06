import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // C'est cette ligne qui active la magie de class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Supprime les propriétés non définies dans le DTO
      forbidNonWhitelisted: true, // Rejette les requêtes avec des propriétés inconnues
      transform: true, // Transforme les types (ex: string en number si demandé)
    }),
  );

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
