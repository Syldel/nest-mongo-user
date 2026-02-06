import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { JwtServicePayload } from './interfaces/jwt-service-payload.interface';

interface ServiceRequest extends Request {
  service?: JwtServicePayload;
}

@Injectable()
export class ServiceScopeGuard implements CanActivate {
  constructor(private requiredScope: string) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<ServiceRequest>();
    const service = request.service;

    if (!service?.scope?.includes(this.requiredScope)) {
      throw new ForbiddenException('Insufficient service scope');
    }

    return true;
  }
}
