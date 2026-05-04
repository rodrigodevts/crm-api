import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Department } from '@prisma/client';
import { PrismaService } from '@/database/prisma.service';
import { decodeCursor } from '@/common/cursor';

type Db = PrismaService | Prisma.TransactionClient;

type ListFilters = {
  active?: boolean | undefined;
  search?: string | undefined;
  sort: 'createdAt' | 'name';
};
type ListPagination = { cursor?: string | undefined; limit: number };
type ListResult = { items: Department[]; hasMore: boolean };

export type CreateDepartmentInput = {
  name: string;
  active?: boolean;
  greetingMessage?: string | null | undefined;
  outOfHoursMessage?: string | null | undefined;
  workingHours?: Prisma.InputJsonValue | null | undefined;
  slaResponseMinutes?: number | null | undefined;
  slaResolutionMinutes?: number | null | undefined;
  distributionMode?: Prisma.DepartmentUncheckedCreateInput['distributionMode'];
};

@Injectable()
export class DepartmentsDomainService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(
    id: string,
    companyId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Department> {
    const db: Db = tx ?? this.prisma;
    const dept = await db.department.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!dept) {
      throw new NotFoundException('Departamento não encontrado');
    }
    return dept;
  }

  async findByIdWithUsers(
    id: string,
    companyId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<
    Department & {
      users: Array<{
        user: { id: string; name: string; role: 'SUPER_ADMIN' | 'ADMIN' | 'SUPERVISOR' | 'AGENT' };
      }>;
    }
  > {
    const db: Db = tx ?? this.prisma;
    const dept = await db.department.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        users: {
          where: { user: { deletedAt: null } },
          include: {
            user: { select: { id: true, name: true, role: true } },
          },
        },
      },
    });
    if (!dept) {
      throw new NotFoundException('Departamento não encontrado');
    }
    return dept;
  }

  async list(
    companyId: string,
    filters: ListFilters,
    pagination: ListPagination,
  ): Promise<ListResult> {
    const where: Prisma.DepartmentWhereInput = {
      companyId,
      deletedAt: null,
      ...(filters.active !== undefined ? { active: filters.active } : {}),
      ...(filters.search
        ? { name: { contains: filters.search, mode: 'insensitive' as const } }
        : {}),
    };

    if (filters.sort === 'name') {
      const decoded = decodeCursor<{ name: string; id: string }>(pagination.cursor);
      if (decoded !== null) {
        if (typeof decoded.name !== 'string' || typeof decoded.id !== 'string') {
          throw new BadRequestException('Cursor inválido');
        }
        where.OR = [{ name: { gt: decoded.name } }, { name: decoded.name, id: { gt: decoded.id } }];
      }
      const items = await this.prisma.department.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: pagination.limit + 1,
      });
      const hasMore = items.length > pagination.limit;
      return { items: hasMore ? items.slice(0, pagination.limit) : items, hasMore };
    }

    // sort === 'createdAt'
    const decoded = decodeCursor<{ createdAt: string; id: string }>(pagination.cursor);
    if (decoded !== null) {
      if (typeof decoded.createdAt !== 'string' || typeof decoded.id !== 'string') {
        throw new BadRequestException('Cursor inválido');
      }
      const cursorDate = new Date(decoded.createdAt);
      where.OR = [
        { createdAt: { lt: cursorDate } },
        { createdAt: cursorDate, id: { lt: decoded.id } },
      ];
    }
    const items = await this.prisma.department.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pagination.limit + 1,
    });
    const hasMore = items.length > pagination.limit;
    return { items: hasMore ? items.slice(0, pagination.limit) : items, hasMore };
  }

  async create(
    input: CreateDepartmentInput,
    companyId: string,
    tx: Prisma.TransactionClient,
  ): Promise<Department> {
    await this.assertNameAvailable(input.name, companyId, tx);
    return tx.department.create({
      data: {
        companyId,
        name: input.name,
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.greetingMessage !== undefined ? { greetingMessage: input.greetingMessage } : {}),
        ...(input.outOfHoursMessage !== undefined
          ? { outOfHoursMessage: input.outOfHoursMessage }
          : {}),
        ...(input.workingHours !== undefined
          ? { workingHours: input.workingHours === null ? Prisma.DbNull : input.workingHours }
          : {}),
        ...(input.slaResponseMinutes !== undefined
          ? { slaResponseMinutes: input.slaResponseMinutes }
          : {}),
        ...(input.slaResolutionMinutes !== undefined
          ? { slaResolutionMinutes: input.slaResolutionMinutes }
          : {}),
        ...(input.distributionMode !== undefined
          ? { distributionMode: input.distributionMode }
          : {}),
      },
    });
  }

  async update(
    id: string,
    companyId: string,
    patch: Prisma.DepartmentUpdateInput,
    tx: Prisma.TransactionClient,
  ): Promise<Department> {
    const existing = await this.findById(id, companyId, tx);
    if (typeof patch.name === 'string' && patch.name !== existing.name) {
      await this.assertNameAvailable(patch.name, companyId, tx, id);
    }
    return tx.department.update({ where: { id }, data: patch });
  }

  async softDelete(id: string, companyId: string, tx: Prisma.TransactionClient): Promise<void> {
    await this.findById(id, companyId, tx);
    await tx.userDepartment.deleteMany({ where: { departmentId: id } });
    await tx.department.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async assertNameAvailable(
    name: string,
    companyId: string,
    tx: Prisma.TransactionClient,
    exceptId?: string,
  ): Promise<void> {
    const existing = await tx.department.findFirst({
      where: { companyId, name, deletedAt: null },
    });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException('Já existe um departamento com este nome');
    }
  }
}
