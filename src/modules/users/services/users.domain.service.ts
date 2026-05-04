import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, User } from '@prisma/client';
import { decodeCursor, encodeCursor } from '@/common/cursor';
import { PrismaService } from '../../../database/prisma.service';

export type UserWithDepartments = User & {
  departments: Array<{ department: { id: string; name: string } }>;
};

export interface CreateUserInput {
  name: string;
  email: string;
  passwordHash: string;
  role: 'ADMIN' | 'SUPERVISOR' | 'AGENT';
  departmentIds: string[];
}

export interface UpdateUserPatch {
  name?: string;
  email?: string;
  passwordHash?: string;
  role?: 'ADMIN' | 'SUPERVISOR' | 'AGENT';
  departmentIds?: string[];
  absenceMessage?: string | null;
  absenceActive?: boolean;
}

export interface ListUsersFilters {
  role?: 'ADMIN' | 'SUPERVISOR' | 'AGENT' | 'SUPER_ADMIN';
  active?: boolean;
  departmentId?: string;
  search?: string;
}

export interface ListUsersPagination {
  cursor?: string;
  limit: number;
}

export interface ListUsersResult {
  items: UserWithDepartments[];
  nextCursor: string | null;
  hasMore: boolean;
}

@Injectable()
export class UsersDomainService {
  constructor(private readonly prisma: PrismaService) {}

  assertNotSuperAdmin(target: User): void {
    if (target.role === 'SUPER_ADMIN') {
      throw new ForbiddenException('Você não tem permissão para esta ação');
    }
  }

  async findByEmailRaw(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async assertEmailNotInUse(email: string, exceptUserId?: string): Promise<void> {
    const existing = await this.findByEmailRaw(email);
    if (existing && existing.id !== exceptUserId) {
      throw new ConflictException('Email já cadastrado');
    }
  }

  async assertDepartmentsBelongToTenant(
    deptIds: string[],
    companyId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (deptIds.length === 0) return;
    const count = await tx.department.count({
      where: { id: { in: deptIds }, companyId, deletedAt: null },
    });
    if (count !== deptIds.length) {
      throw new BadRequestException('Departamento(s) não encontrado(s) no tenant');
    }
  }

  async assertNotLastAdmin(
    userId: string,
    companyId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const others = await tx.user.count({
      where: {
        companyId,
        role: 'ADMIN',
        deletedAt: null,
        id: { not: userId },
      },
    });
    if (others === 0) {
      throw new ConflictException('Não é possível remover o último ADMIN do tenant');
    }
  }

  async findByIdWithDepartments(
    userId: string,
    companyId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<UserWithDepartments> {
    const db = tx ?? this.prisma;
    const user = await db.user.findFirst({
      where: { id: userId, companyId, deletedAt: null },
      include: {
        departments: {
          include: {
            department: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    return user;
  }

  async list(
    companyId: string,
    filters: ListUsersFilters,
    pagination: ListUsersPagination,
  ): Promise<ListUsersResult> {
    const decoded = decodeCursor<{ createdAt: string; id: string }>(pagination.cursor);
    if (decoded !== null) {
      if (typeof decoded.createdAt !== 'string' || typeof decoded.id !== 'string') {
        throw new BadRequestException('Cursor inválido');
      }
    }
    const conditions: Prisma.UserWhereInput[] = [];
    if (filters.search) {
      conditions.push({
        OR: [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { email: { contains: filters.search, mode: 'insensitive' } },
        ],
      });
    }
    if (decoded) {
      conditions.push({
        OR: [
          { createdAt: { lt: new Date(decoded.createdAt) } },
          { createdAt: new Date(decoded.createdAt), id: { lt: decoded.id } },
        ],
      });
    }

    const where: Prisma.UserWhereInput = {
      companyId,
      ...(filters.active !== false ? { deletedAt: null } : {}),
      ...(filters.role ? { role: filters.role } : {}),
      ...(filters.departmentId
        ? { departments: { some: { departmentId: filters.departmentId } } }
        : {}),
      ...(conditions.length > 0 ? { AND: conditions } : {}),
    };

    const items = await this.prisma.user.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pagination.limit + 1,
      include: {
        departments: {
          include: { department: { select: { id: true, name: true } } },
        },
      },
    });

    const hasMore = items.length > pagination.limit;
    const trimmed = hasMore ? items.slice(0, pagination.limit) : items;
    const last = trimmed[trimmed.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
        : null;

    return { items: trimmed, nextCursor, hasMore };
  }

  async create(
    input: CreateUserInput,
    companyId: string,
    tx: Prisma.TransactionClient,
  ): Promise<UserWithDepartments> {
    await this.assertEmailNotInUse(input.email);
    await this.assertDepartmentsBelongToTenant(input.departmentIds, companyId, tx);

    const created = await tx.user.create({
      data: {
        companyId,
        name: input.name,
        email: input.email,
        passwordHash: input.passwordHash,
        role: input.role,
      },
    });

    if (input.departmentIds.length > 0) {
      await tx.userDepartment.createMany({
        data: input.departmentIds.map((d) => ({ userId: created.id, departmentId: d })),
      });
    }

    return this.findByIdWithDepartments(created.id, companyId, tx);
  }

  async update(
    userId: string,
    companyId: string,
    patch: UpdateUserPatch,
    tx: Prisma.TransactionClient,
  ): Promise<UserWithDepartments> {
    const existing = await this.findByIdWithDepartments(userId, companyId, tx);
    this.assertNotSuperAdmin(existing);

    if (patch.email && patch.email !== existing.email) {
      await this.assertEmailNotInUse(patch.email, existing.id);
    }

    if (patch.role && existing.role === 'ADMIN' && patch.role !== 'ADMIN') {
      await this.assertNotLastAdmin(existing.id, companyId, tx);
    }

    if (patch.departmentIds !== undefined) {
      await this.assertDepartmentsBelongToTenant(patch.departmentIds, companyId, tx);
      await this.syncDepartments(existing.id, patch.departmentIds, tx);
    }

    const userScalarPatch: Prisma.UserUpdateInput = {};
    if (patch.name !== undefined) userScalarPatch.name = patch.name;
    if (patch.email !== undefined) userScalarPatch.email = patch.email;
    if (patch.passwordHash !== undefined) userScalarPatch.passwordHash = patch.passwordHash;
    if (patch.role !== undefined) userScalarPatch.role = patch.role;
    if (patch.absenceMessage !== undefined) userScalarPatch.absenceMessage = patch.absenceMessage;
    if (patch.absenceActive !== undefined) userScalarPatch.absenceActive = patch.absenceActive;

    if (Object.keys(userScalarPatch).length > 0) {
      await tx.user.update({ where: { id: existing.id }, data: userScalarPatch });
    }

    return this.findByIdWithDepartments(existing.id, companyId, tx);
  }

  private async syncDepartments(
    userId: string,
    deptIds: string[],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.userDepartment.deleteMany({ where: { userId } });
    if (deptIds.length > 0) {
      await tx.userDepartment.createMany({
        data: deptIds.map((d) => ({ userId, departmentId: d })),
      });
    }
  }

  async softDelete(userId: string, companyId: string, tx: Prisma.TransactionClient): Promise<void> {
    const existing = await this.findByIdWithDepartments(userId, companyId, tx);
    this.assertNotSuperAdmin(existing);
    if (existing.role === 'ADMIN') {
      await this.assertNotLastAdmin(existing.id, companyId, tx);
    }
    await tx.user.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
  }
}
