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

    // Le scope vient du JWT, dont rien ne garantit la forme : sur une chaîne,
    // `includes` cherchait une sous-chaîne et « users:agentKeys » ouvrait la clé
    // d'agent. Seul un tableau est lu.
    if (
      !Array.isArray(service.scope) ||
      !service.scope.includes(this.requiredScope)
    ) {
      throw new ForbiddenException('Insufficient service scope');
    }

    return true;
  }
}
