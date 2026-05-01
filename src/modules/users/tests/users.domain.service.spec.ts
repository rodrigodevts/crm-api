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

describe('UsersDomainService.create', () => {
  let service: UsersDomainService;
  let prisma: {
    user: {
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
    };
  };
  let tx: {
    user: { create: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
    department: { count: ReturnType<typeof vi.fn> };
    userDepartment: { createMany: ReturnType<typeof vi.fn> };
  };
  const COMPANY = '00000000-0000-7000-8000-00000000aaaa';

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
      },
    };
    tx = {
      user: { create: vi.fn(), findFirst: vi.fn() },
      department: { count: vi.fn() },
      userDepartment: { createMany: vi.fn() },
    };
    service = new UsersDomainService(prisma as unknown as PrismaService);
  });

  it('throws ConflictException when email is already in use', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser({ email: 'taken@x.com' }));
    await expect(
      service.create(
        {
          name: 'New',
          email: 'taken@x.com',
          passwordHash: 'h',
          role: 'AGENT',
          departmentIds: [],
        },
        COMPANY,
        tx as never,
      ),
    ).rejects.toMatchObject({ status: 409, message: 'Email já cadastrado' });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when departmentIds do not all belong to tenant', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    tx.department.count.mockResolvedValue(1);
    await expect(
      service.create(
        {
          name: 'New',
          email: 'new@x.com',
          passwordHash: 'h',
          role: 'AGENT',
          departmentIds: [
            '00000000-0000-7000-8000-00000000d001',
            '00000000-0000-7000-8000-00000000d002',
          ],
        },
        COMPANY,
        tx as never,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('creates user without departments when departmentIds is empty', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const created = baseUser({ id: 'new-id', email: 'new@x.com' });
    tx.user.create.mockResolvedValue(created);
    tx.user.findFirst.mockResolvedValue({ ...created, departments: [] });

    const result = await service.create(
      {
        name: 'New',
        email: 'new@x.com',
        passwordHash: 'h',
        role: 'AGENT',
        departmentIds: [],
      },
      COMPANY,
      tx as never,
    );

    expect(tx.user.create).toHaveBeenCalled();
    expect(tx.userDepartment.createMany).not.toHaveBeenCalled();
    expect(result.id).toBe('new-id');
  });

  it('creates user and links departments when departmentIds is non-empty', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    tx.department.count.mockResolvedValue(2);
    const created = baseUser({ id: 'new-id', email: 'new@x.com' });
    tx.user.create.mockResolvedValue(created);
    tx.user.findFirst.mockResolvedValue({ ...created, departments: [] });
    const ids = ['00000000-0000-7000-8000-00000000d001', '00000000-0000-7000-8000-00000000d002'];

    await service.create(
      {
        name: 'New',
        email: 'new@x.com',
        passwordHash: 'h',
        role: 'AGENT',
        departmentIds: ids,
      },
      COMPANY,
      tx as never,
    );

    expect(tx.userDepartment.createMany).toHaveBeenCalledWith({
      data: ids.map((d) => ({ userId: 'new-id', departmentId: d })),
    });
  });
});

describe('UsersDomainService.update', () => {
  let service: UsersDomainService;
  let prisma: {
    user: { findUnique: ReturnType<typeof vi.fn> };
  };
  let tx: {
    user: {
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
    };
    department: { count: ReturnType<typeof vi.fn> };
    userDepartment: {
      deleteMany: ReturnType<typeof vi.fn>;
      createMany: ReturnType<typeof vi.fn>;
    };
  };
  const COMPANY = '00000000-0000-7000-8000-00000000aaaa';
  const USER_ID = '00000000-0000-7000-8000-000000000001';

  beforeEach(() => {
    prisma = { user: { findUnique: vi.fn() } };
    tx = {
      user: { findFirst: vi.fn(), update: vi.fn(), count: vi.fn() },
      department: { count: vi.fn() },
      userDepartment: { deleteMany: vi.fn(), createMany: vi.fn() },
    };
    service = new UsersDomainService(prisma as unknown as PrismaService);
  });

  const stubExisting = (overrides: Partial<User> = {}) => {
    const existing = {
      ...baseUser({ id: USER_ID, companyId: COMPANY, ...overrides }),
      departments: [],
    };
    tx.user.findFirst.mockResolvedValue(existing);
    return existing;
  };

  it('throws NotFoundException when target does not exist or is soft-deleted', async () => {
    tx.user.findFirst.mockResolvedValue(null);
    await expect(
      service.update(USER_ID, COMPANY, { name: 'X' }, tx as never),
    ).rejects.toMatchObject({ status: 404, message: 'Usuário não encontrado' });
  });

  it('throws ForbiddenException when target is SUPER_ADMIN', async () => {
    stubExisting({ role: 'SUPER_ADMIN' });
    await expect(
      service.update(USER_ID, COMPANY, { name: 'X' }, tx as never),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('throws ConflictException when email is changed to one already in use', async () => {
    stubExisting({ role: 'AGENT', email: 'self@x.com' });
    prisma.user.findUnique.mockResolvedValue(baseUser({ id: 'other', email: 'taken@x.com' }));
    await expect(
      service.update(USER_ID, COMPANY, { email: 'taken@x.com' }, tx as never),
    ).rejects.toMatchObject({ status: 409, message: 'Email já cadastrado' });
  });

  it('passes when email is unchanged', async () => {
    stubExisting({ role: 'AGENT', email: 'self@x.com' });
    tx.user.update.mockResolvedValue({});
    tx.user.findFirst.mockResolvedValueOnce({
      ...baseUser({ id: USER_ID, role: 'AGENT', email: 'self@x.com' }),
      departments: [],
    });
    tx.user.findFirst.mockResolvedValueOnce({
      ...baseUser({ id: USER_ID, role: 'AGENT', email: 'self@x.com', name: 'Renamed' }),
      departments: [],
    });
    await expect(
      service.update(USER_ID, COMPANY, { name: 'Renamed' }, tx as never),
    ).resolves.toBeDefined();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('throws ConflictException when demoting the last ADMIN', async () => {
    stubExisting({ role: 'ADMIN' });
    tx.user.count.mockResolvedValue(0);
    await expect(
      service.update(USER_ID, COMPANY, { role: 'AGENT' }, tx as never),
    ).rejects.toMatchObject({
      status: 409,
      message: 'Não é possível remover o último ADMIN do tenant',
    });
  });

  it('passes when demoting an ADMIN with at least one other active ADMIN', async () => {
    stubExisting({ role: 'ADMIN' });
    tx.user.count.mockResolvedValue(1);
    tx.user.update.mockResolvedValue({});
    tx.user.findFirst.mockResolvedValueOnce({
      ...baseUser({ id: USER_ID, role: 'ADMIN' }),
      departments: [],
    });
    tx.user.findFirst.mockResolvedValueOnce({
      ...baseUser({ id: USER_ID, role: 'AGENT' }),
      departments: [],
    });
    await expect(
      service.update(USER_ID, COMPANY, { role: 'AGENT' }, tx as never),
    ).resolves.toBeDefined();
  });

  it('replaces departments completely when departmentIds is provided', async () => {
    stubExisting({ role: 'AGENT' });
    tx.department.count.mockResolvedValue(2);
    tx.user.update.mockResolvedValue({});
    tx.user.findFirst.mockResolvedValueOnce({
      ...baseUser({ id: USER_ID, role: 'AGENT' }),
      departments: [],
    });
    tx.user.findFirst.mockResolvedValueOnce({
      ...baseUser({ id: USER_ID, role: 'AGENT' }),
      departments: [],
    });
    const ids = ['00000000-0000-7000-8000-00000000d001', '00000000-0000-7000-8000-00000000d002'];

    await service.update(USER_ID, COMPANY, { departmentIds: ids }, tx as never);

    expect(tx.userDepartment.deleteMany).toHaveBeenCalledWith({ where: { userId: USER_ID } });
    expect(tx.userDepartment.createMany).toHaveBeenCalledWith({
      data: ids.map((d) => ({ userId: USER_ID, departmentId: d })),
    });
  });
});
