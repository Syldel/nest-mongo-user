import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { JwtUserPayload } from './interfaces/jwt-user-payload.interface';

interface RequestWithUser extends Request {
  user?: JwtUserPayload;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();

    const token = this.extractTokenFromHeader(request);
    if (!token) throw new UnauthorizedException('Token missing');

    let payload: JwtUserPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtUserPayload>(token, {
        secret: this.configService.get<string>('JWT_USER_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    request.user = {
      sub: payload.sub,
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
