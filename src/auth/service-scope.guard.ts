import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

/**
 * ⚠️ Le scope est celui que l'émetteur a écrit dans son jeton, et le secret
 * de service est partagé par les trois services : tout détenteur peut signer
 * n'importe quel scope. Décision de le garder pour l'instant, et les cas où
 * elle ne tient plus : docs/service-tokens.md. À relire avant d'ajouter un
 * scope ou un service.
 */
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
