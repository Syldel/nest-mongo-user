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
 * caractères : « é » en vaut deux. Argon2id lèvera cette limite : prévu, sans
 * urgence, voir docs/password-hashing.md.
 */
const BCRYPT_MAX_BYTES = 72;

/**
 * NIST SP 800-63B-4 : un mot de passe utilisé comme facteur unique « SHALL »
 * faire au moins 15 caractères, chaque point de code Unicode comptant pour
 * un (ce que fait `MinLength`, qui compte une paire de substitution comme un
 * seul caractère). C'est le cas ici : il n'y a pas de second facteur.
 * Seuls l'inscription et le changement l'imposent ; un mot de passe plus
 * court créé avant le 2026-11-03 reste valable à la connexion.
 */
const PASSWORD_MIN_LENGTH = 15;
const PASSWORD_TOO_SHORT = `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`;
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
  @MinLength(PASSWORD_MIN_LENGTH, { message: PASSWORD_TOO_SHORT })
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
  @MinLength(PASSWORD_MIN_LENGTH, { message: PASSWORD_TOO_SHORT })
  @IsByteLength(0, BCRYPT_MAX_BYTES, { message: PASSWORD_TOO_LONG })
  newPassword: string;

  @IsString()
  confirmPassword: string;
}
