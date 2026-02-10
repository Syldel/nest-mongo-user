import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class ServiceScopeGuard implements CanActivate {
  constructor(private requiredScope: string) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    const service = request.service;
    if (!service) {
      throw new UnauthorizedException('Service not authenticated');
    }

    if (!service?.scope?.includes(this.requiredScope)) {
      throw new ForbiddenException('Insufficient service scope');
    }

    return true;
  }
}
