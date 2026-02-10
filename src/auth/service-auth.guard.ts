import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { JwtServicePayload } from './interfaces/jwt-service-payload.interface';

@Injectable()
export class ServiceAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException('Service token missing');
    }

    let payload: JwtServicePayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtServicePayload>(token, {
        secret: this.configService.get<string>('JWT_SERVICE_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid service token');
    }

    request.service = {
      id: payload.sub,
      scope: payload.scope,
    };

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
