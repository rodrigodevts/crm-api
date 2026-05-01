import { ForbiddenException } from '@nestjs/common';
import type { User } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../../database/prisma.service';
import { UsersDomainService } from '../services/users.domain.service';

const baseUser = (overrides: Partial<User> = {}): User => ({
  id: '00000000-0000-7000-8000-000000000001',
  companyId: '00000000-0000-7000-8000-00000000aaaa',
  name: 'Test',
  email: 'user@test.local',
  passwordHash: '',
  role: 'AGENT',
  absenceMessage: null,
  absenceActive: false,
  lastSeenAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...overrides,
});

describe('UsersDomainService.assertNotSuperAdmin', () => {
  let service: UsersDomainService;

  beforeEach(() => {
    service = new UsersDomainService({} as unknown as PrismaService);
  });

  it('throws ForbiddenException when target is SUPER_ADMIN', () => {
    const target = baseUser({ role: 'SUPER_ADMIN' });
    expect(() => service.assertNotSuperAdmin(target)).toThrow(
      new ForbiddenException('Você não tem permissão para esta ação'),
    );
  });

  it('passes when target is ADMIN', () => {
    expect(() => service.assertNotSuperAdmin(baseUser({ role: 'ADMIN' }))).not.toThrow();
  });

  it('passes when target is SUPERVISOR', () => {
    expect(() => service.assertNotSuperAdmin(baseUser({ role: 'SUPERVISOR' }))).not.toThrow();
  });

  it('passes when target is AGENT', () => {
    expect(() => service.assertNotSuperAdmin(baseUser({ role: 'AGENT' }))).not.toThrow();
  });
});
