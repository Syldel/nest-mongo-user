import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Req,
  Patch,
  ForbiddenException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { AuthGuard } from './auth.guard';
import { ActiveUser } from './interfaces/active-user.interface';

interface RequestWithUser extends Request {
  user: ActiveUser;
}

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
  ) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Registration disabled in production');
    }
    return this.authService.register(dto);
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(AuthGuard)
  @Get('me')
  getProfile(@Req() req: RequestWithUser) {
    return this.usersService.findById(req.user.sub);
  }

  @UseGuards(AuthGuard)
  @Patch('strategy')
  async updateMyStrategy(
    @Req() req: RequestWithUser,
    @Body() strategyDto: Record<string, unknown>,
  ) {
    return this.usersService.updateStrategy(req.user.sub, strategyDto);
  }
}
