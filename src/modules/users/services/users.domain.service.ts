import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, User } from '@prisma/client';
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

  encodeCursor(createdAt: Date, id: string): string {
    return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id }), 'utf8').toString(
      'base64url',
    );
  }

  decodeCursor(cursor: string | undefined): { createdAt: Date; id: string } | null {
    if (cursor === undefined) return null;
    try {
      const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
      const parsed = JSON.parse(decoded) as { createdAt: string; id: string };
      return { createdAt: new Date(parsed.createdAt), id: parsed.id };
    } catch {
      throw new BadRequestException('Cursor inválido');
    }
  }

  async list(
    companyId: string,
    filters: ListUsersFilters,
    pagination: ListUsersPagination,
  ): Promise<ListUsersResult> {
    const decoded = this.decodeCursor(pagination.cursor);
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
          { createdAt: { lt: decoded.createdAt } },
          { createdAt: decoded.createdAt, id: { lt: decoded.id } },
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
    const nextCursor = hasMore && last ? this.encodeCursor(last.createdAt, last.id) : null;

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
}
