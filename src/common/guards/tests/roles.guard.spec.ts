import { describe, it, expect, beforeEach, vi } from 'vitest';
import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { User } from '@prisma/client';
import { RolesGuard } from '../roles.guard';

function ctxFor(user: Partial<User> | null): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe('RolesGuard hierarchy', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('allows when no @Roles metadata is set', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(ctxFor({ role: 'AGENT' }))).toBe(true);
  });

  it('blocks AGENT from @Roles(ADMIN) → throws 403', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    expect(() => guard.canActivate(ctxFor({ role: 'AGENT' }))).toThrow(ForbiddenException);
  });

  it('allows ADMIN to pass @Roles(AGENT) (hierarchy: ADMIN ≥ AGENT)', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['AGENT']);
    expect(guard.canActivate(ctxFor({ role: 'ADMIN' }))).toBe(true);
  });

  it('allows SUPER_ADMIN through any @Roles', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    expect(guard.canActivate(ctxFor({ role: 'SUPER_ADMIN' }))).toBe(true);
  });

  it('blocks SUPERVISOR from @Roles(ADMIN)', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    expect(() => guard.canActivate(ctxFor({ role: 'SUPERVISOR' }))).toThrow(ForbiddenException);
  });

  it('throws 403 when no user is attached and @Roles is required', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['AGENT']);
    expect(() => guard.canActivate(ctxFor(null))).toThrow(ForbiddenException);
  });
});
