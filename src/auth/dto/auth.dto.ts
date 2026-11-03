import { Transform } from 'class-transformer';
import {
  IsByteLength,
  IsString,
  MinLength,
  Matches,
  ValidateIf,
} from 'class-validator';

/**
 * bcrypt ne lit que les 72 premiers octets : au-delà, deux mots de passe qui
 * ne diffèrent qu'après ce seuil ouvrent le même compte. La fiche Password
 * Storage de l'OWASP demande d'imposer ce maximum. En octets UTF-8, pas en
 * caractères : « é » en vaut deux.
 */
const BCRYPT_MAX_BYTES = 72;
const PASSWORD_TOO_LONG = `Password must be at most ${BCRYPT_MAX_BYTES} bytes long`;

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
  @IsByteLength(0, BCRYPT_MAX_BYTES, { message: PASSWORD_TOO_LONG })
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
  @IsByteLength(0, BCRYPT_MAX_BYTES, { message: PASSWORD_TOO_LONG })
  password: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8)
  @IsByteLength(0, BCRYPT_MAX_BYTES, { message: PASSWORD_TOO_LONG })
  newPassword: string;

  @IsString()
  confirmPassword: string;
}
