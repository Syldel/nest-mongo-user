import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
} from '@nestjs/common';
import { readStoredAgentKey } from './agent-key';
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

  @ServiceAccess('users:read', 'users:agentKey')
  @Get(':userId/agent-credentials')
  async getAgentCredentials(@Param('userId') userId: string) {
    const user = await this.usersService.findByIdWithAgentKey(userId);

    // Un objet JSON et non la chaîne nue : Nest renverrait une chaîne en
    // text/html, et le gateway lit `response.json()`.
    return { agentKey: readStoredAgentKey(user?.agentKey) };
  }
}
