import { Global, Module } from '@nestjs/common';
import { UserContextService } from './user-context.service';
import { PermissionsGuard } from './permissions.guard';

/**
 * Authorization primitives (§6). Exported globally so any feature module can
 * apply @UseGuards(JwtAuthGuard, PermissionsGuard) with @RequirePermissions.
 */
@Global()
@Module({
  providers: [UserContextService, PermissionsGuard],
  exports: [UserContextService, PermissionsGuard],
})
export class AuthzModule {}
