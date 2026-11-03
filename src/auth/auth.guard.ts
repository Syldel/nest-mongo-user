import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { JWT_ALGORITHM } from './jwt-secret';
import { JwtUserPayload } from './interfaces/jwt-user-payload.interface';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const token = this.extractTokenFromHeader(request);
    if (!token) throw new UnauthorizedException('Token missing');

    let payload: JwtUserPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtUserPayload>(token, {
        secret: this.configService.get<string>('JWT_USER_SECRET'),
        algorithms: [JWT_ALGORITHM],
      });
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
    // jsonwebtoken ne contrôle `exp` que s'il est présent : un jeton signé
    // sans (le bot le faisait pour ses jetons de service jusqu'au 2026-11-03)
    // n'expirait jamais.
    if (typeof payload.exp !== 'number') {
      throw new UnauthorizedException('Invalid token');
    }

    request.user = {
      id: payload.sub,
      wallet: payload.wallet,
      username: payload.username,
    };

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
