import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { User, UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

const WEIGHT: Record<UserRole, number> = {
  AGENT: 1,
  SUPERVISOR: 2,
  ADMIN: 3,
  SUPER_ADMIN: 4,
};

const FORBIDDEN_MESSAGE = 'Você não tem permissão para esta ação';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user?: User }>();
    const user = request.user;
    if (!user) throw new ForbiddenException(FORBIDDEN_MESSAGE);

    const minRequired = Math.min(...required.map((role) => WEIGHT[role]));
    if (WEIGHT[user.role] < minRequired) {
      throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }
    return true;
  }
}
