import { applyDecorators, UseGuards } from '@nestjs/common';
import { ServiceAuthGuard } from './service-auth.guard';
import { ServiceScopeGuard } from './service-scope.guard';

export function ServiceAccess(scope: string) {
  return applyDecorators(
    UseGuards(ServiceAuthGuard, new ServiceScopeGuard(scope)),
  );
}
