import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { FastifyRequest } from 'fastify';

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): User => {
  const request = ctx.switchToHttp().getRequest<FastifyRequest & { user?: User }>();
  if (!request.user) {
    throw new Error('CurrentUser decorator used outside of authenticated route');
  }
  return request.user;
});
