import { Transform } from 'class-transformer';
import { IsString, MinLength, Matches, ValidateIf } from 'class-validator';

export class RegisterDto {
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  @Matches(/^0x[a-fA-F0-9]{40}$/, {
    message: 'Invalid Ethereum wallet address',
  })
  walletAddress: string;

  @IsString()
  // @MinLength(3)
  @Transform(({ value }: { value: string }) => value.trim().toLowerCase())
  @Matches(/^(?=.{3,20}$)(?!.*[_.-]{2})[a-z0-9]+([_.-]?[a-z0-9]+)*$/, {
    message:
      'Username must be 3-20 chars, lowercase, no double separators, no special chars except . _ -',
  })
  username: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password: string;
}

export class LoginDto {
  @ValidateIf((o: LoginDto) => !o.username)
  @IsString()
  walletAddress?: string;

  @ValidateIf((o: LoginDto) => !o.walletAddress)
  @IsString()
  username?: string;

  @IsString()
  password: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8)
  newPassword: string;

  @IsString()
  confirmPassword: string;
}
