import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { FastifyRequest } from 'fastify';

export const CurrentCompany = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<FastifyRequest & { user?: User }>();
    if (!request.user) {
      throw new Error('CurrentCompany decorator used outside of authenticated route');
    }
    return request.user.companyId;
  },
);
