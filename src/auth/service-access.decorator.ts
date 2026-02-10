import { applyDecorators, UseGuards } from '@nestjs/common';
import { ServiceAuthGuard } from './service-auth.guard';
import { ServiceScopeGuard } from './service-scope.guard';

export const ServiceAccess = (...scopes: string[]) =>
  applyDecorators(
    UseGuards(ServiceAuthGuard, ...scopes.map((s) => new ServiceScopeGuard(s))),
  );
