import { IsString, MinLength, Matches } from 'class-validator';

export class RegisterDto {
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{40}$/, {
    message: 'Invalid Ethereum wallet address',
  })
  walletAddress: string;

  @IsString()
  @MinLength(3)
  username: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password: string;
}

export class LoginDto {
  @IsString()
  walletAddress: string;

  @IsString()
  password: string;
}
