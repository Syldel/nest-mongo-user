import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { RegisterDto, LoginDto, ChangePasswordDto } from './dto/auth.dto';
import { JwtUserPayload } from './interfaces/jwt-user-payload.interface';
import { User } from '../users/user.schema';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const walletAddress = dto.walletAddress.trim();
    const username = dto.username.trim().toLowerCase();
    const password = dto.password;

    // Check if user exists (Wallet address)
    const existingWallet =
      await this.usersService.findOneByWallet(walletAddress);
    if (existingWallet) {
      throw new ConflictException('Wallet address already registered');
    }

    // Check if user exists (Username)
    const existingUsername =
      await this.usersService.findOneByUsername(username);
    if (existingUsername) {
      throw new ConflictException('Username already taken');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    return this.usersService.create({
      walletAddress,
      username,
      password: hashedPassword,
    });
  }

  async login(dto: LoginDto) {
    let user: User | null;
    if (dto.username) {
      user = await this.usersService.findOneByUsernameForAuth(dto.username);
    } else if (dto.walletAddress) {
      user = await this.usersService.findOneByWalletForAuth(dto.walletAddress);
    } else {
      throw new BadRequestException(
        'username or walletAddress must be provided',
      );
    }

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

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const { currentPassword, newPassword, confirmPassword } = dto;

    if (newPassword !== confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const user = await this.usersService.findByIdForAuth(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid current password');
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    return { message: 'Password updated successfully' };
  }
}
