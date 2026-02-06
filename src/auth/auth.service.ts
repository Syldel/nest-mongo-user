import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { JwtUserPayload } from './interfaces/jwt-user-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const { walletAddress, username, password } = dto;

    // Check if user exists
    const existingUser = await this.usersService.findOneByWallet(walletAddress);
    if (existingUser) {
      throw new ConflictException('Wallet address already registered');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    return this.usersService.create({
      walletAddress,
      username,
      password: hashedPassword,
    });
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findOneByWallet(dto.walletAddress);

    if (user && (await bcrypt.compare(dto.password, user.password))) {
      const payload: JwtUserPayload = {
        sub: user._id.toString(),
        wallet: user.walletAddress,
        username: user.username,
      };

      return {
        access_token: this.jwtService.sign(payload),
      };
    }

    throw new UnauthorizedException('Invalid credentials');
  }
}
