import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { ServiceAccess } from '../auth/service-access.decorator';

@Controller('internal/users')
export class InternalUsersController {
  constructor(private usersService: UsersService) {}

  @ServiceAccess('users:read')
  @Get()
  async findAllUsers() {
    return this.usersService.findAll();
  }

  @ServiceAccess('users:write')
  @Delete('by-wallet/:wallet')
  deleteByWallet(@Param('wallet') wallet: string) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException(
        'Deletion by wallet is disabled in production',
      );
    }
    return this.usersService.deleteByWallet(wallet);
  }

  @ServiceAccess('users:read')
  @Get(':userId/agent-credentials')
  async getAgentCredentials(@Param('userId') userId: string) {
    const user = await this.usersService.findByIdWithAgentKey(userId);

    if (!user || !user.agentKey) {
      throw new NotFoundException('No agent key configured for this user');
    }

    return user.agentKey;
  }
}
