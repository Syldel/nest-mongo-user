import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from './auth/auth.module';
import { ServiceAuthModule } from './auth/service-auth.module';
import { User, UserSchema } from './users/user.schema';
import { HttpClientService } from './utils/http-client.service';
import { WebhookService } from './webhook/webhook.service';
import { MongoWatcherService } from './watcher/mongo-watcher.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGO_URI'),
      }),
    }),

    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),

    AuthModule,
    ServiceAuthModule,
  ],
  providers: [HttpClientService, WebhookService, MongoWatcherService],
})
export class AppModule {}
