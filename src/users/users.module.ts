import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './user.schema';
import { UsersService } from './users.service';
import { ServiceAuthModule } from '../auth/service-auth.module';
import { InternalUsersController } from './internal-users.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    ServiceAuthModule,
  ],
  controllers: [InternalUsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
