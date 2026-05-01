import { ForbiddenException } from '@nestjs/common';
import type { User } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('UsersDomainService.assertEmailNotInUse', () => {
  let service: UsersDomainService;
  let prisma: { user: { findUnique: ReturnType<typeof vi.fn> } };

  beforeEach(() => {
    prisma = { user: { findUnique: vi.fn() } };
    service = new UsersDomainService(prisma as unknown as PrismaService);
  });

  it('passes when email is not in use', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.assertEmailNotInUse('new@x.com')).resolves.toBeUndefined();
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'new@x.com' } });
  });

  it('throws ConflictException when another user has the email (any tenant, including soft-deleted)', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser({ id: 'other-id', email: 'taken@x.com' }));
    await expect(service.assertEmailNotInUse('taken@x.com')).rejects.toMatchObject({
      status: 409,
      message: 'Email já cadastrado',
    });
  });

  it('throws ConflictException even when email belongs to a soft-deleted user', async () => {
    prisma.user.findUnique.mockResolvedValue(
      baseUser({ id: 'deleted-id', email: 'old@x.com', deletedAt: new Date() }),
    );
    await expect(service.assertEmailNotInUse('old@x.com')).rejects.toMatchObject({ status: 409 });
  });

  it('passes when email belongs to the same user (exceptUserId)', async () => {
    const existing = baseUser({ id: 'self-id', email: 'self@x.com' });
    prisma.user.findUnique.mockResolvedValue(existing);
    await expect(service.assertEmailNotInUse('self@x.com', 'self-id')).resolves.toBeUndefined();
  });

  it('throws when email belongs to a different user even when exceptUserId is provided', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser({ id: 'other-id', email: 'taken@x.com' }));
    await expect(service.assertEmailNotInUse('taken@x.com', 'self-id')).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe('UsersDomainService.assertDepartmentsBelongToTenant', () => {
  let service: UsersDomainService;
  let tx: { department: { count: ReturnType<typeof vi.fn> } };
  const COMPANY = '00000000-0000-7000-8000-00000000aaaa';

  beforeEach(() => {
    tx = { department: { count: vi.fn() } };
    service = new UsersDomainService({} as unknown as PrismaService);
  });

  it('returns immediately without DB call when deptIds is empty', async () => {
    await expect(
      service.assertDepartmentsBelongToTenant([], COMPANY, tx as never),
    ).resolves.toBeUndefined();
    expect(tx.department.count).not.toHaveBeenCalled();
  });

  it('passes when count matches deptIds.length', async () => {
    tx.department.count.mockResolvedValue(2);
    const ids = ['00000000-0000-7000-8000-00000000d001', '00000000-0000-7000-8000-00000000d002'];
    await expect(
      service.assertDepartmentsBelongToTenant(ids, COMPANY, tx as never),
    ).resolves.toBeUndefined();
    expect(tx.department.count).toHaveBeenCalledWith({
      where: { id: { in: ids }, companyId: COMPANY, deletedAt: null },
    });
  });

  it('throws BadRequestException when count is less than deptIds.length', async () => {
    tx.department.count.mockResolvedValue(1);
    const ids = ['00000000-0000-7000-8000-00000000d001', '00000000-0000-7000-8000-00000000d002'];
    await expect(
      service.assertDepartmentsBelongToTenant(ids, COMPANY, tx as never),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Departamento(s) não encontrado(s) no tenant',
    });
  });
});

describe('UsersDomainService.assertNotLastAdmin', () => {
  let service: UsersDomainService;
  let tx: { user: { count: ReturnType<typeof vi.fn> } };
  const COMPANY = '00000000-0000-7000-8000-00000000aaaa';
  const USER_ID = '00000000-0000-7000-8000-000000000001';

  beforeEach(() => {
    tx = { user: { count: vi.fn() } };
    service = new UsersDomainService({} as unknown as PrismaService);
  });

  it('passes when at least one other active ADMIN exists in the tenant', async () => {
    tx.user.count.mockResolvedValue(1);
    await expect(
      service.assertNotLastAdmin(USER_ID, COMPANY, tx as never),
    ).resolves.toBeUndefined();
    expect(tx.user.count).toHaveBeenCalledWith({
      where: {
        companyId: COMPANY,
        role: 'ADMIN',
        deletedAt: null,
        id: { not: USER_ID },
      },
    });
  });

  it('throws ConflictException when no other active ADMIN exists', async () => {
    tx.user.count.mockResolvedValue(0);
    await expect(service.assertNotLastAdmin(USER_ID, COMPANY, tx as never)).rejects.toMatchObject({
      status: 409,
      message: 'Não é possível remover o último ADMIN do tenant',
    });
  });
});

describe('UsersDomainService.list cursor encoding', () => {
  let service: UsersDomainService;

  beforeEach(() => {
    service = new UsersDomainService({} as unknown as PrismaService);
  });

  it('encodes and decodes a cursor symmetrically', () => {
    const date = new Date('2026-05-01T10:00:00.000Z');
    const id = '00000000-0000-7000-8000-000000000001';
    const cursor = service.encodeCursor(date, id);
    expect(typeof cursor).toBe('string');
    const decoded = service.decodeCursor(cursor);
    expect(decoded).toEqual({ createdAt: date, id });
  });

  it('returns null when decoding undefined', () => {
    expect(service.decodeCursor(undefined)).toBeNull();
  });

  it('throws BadRequestException when cursor is malformed', () => {
    expect(() => service.decodeCursor('not-base64-json')).toThrow();
  });
});
