import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Company } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { decodeCursor, encodeCursor } from '../../../common/cursor';

export interface ListCompaniesFilters {
  active?: boolean;
  search?: string;
}

export interface ListCompaniesPagination {
  cursor?: string;
  limit: number;
}

export interface ListCompaniesResult {
  items: Company[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CreateCompanyInput {
  name: string;
  slug: string;
  planId: string;
  timezone: string;
  defaultWorkingHours: unknown;
  outOfHoursMessage: string | null;
}

@Injectable()
export class CompaniesDomainService {
  constructor(private readonly prisma: PrismaService) {}

  async assertSlugAvailable(
    slug: string,
    tx: Prisma.TransactionClient,
    exceptId?: string,
  ): Promise<void> {
    const existing = await tx.company.findFirst({ where: { slug } });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException('Slug já em uso');
    }
  }

  async assertPlanIsActive(planId: string, tx: Prisma.TransactionClient): Promise<void> {
    const plan = await tx.plan.findFirst({ where: { id: planId, active: true } });
    if (!plan) {
      throw new UnprocessableEntityException('Plano não encontrado ou inativo');
    }
  }

  async assertNoActiveUsers(companyId: string, tx: Prisma.TransactionClient): Promise<void> {
    const count = await tx.user.count({
      where: { companyId, deletedAt: null },
    });
    if (count > 0) {
      throw new ConflictException(
        'Não é possível excluir empresa com usuários ativos. Remova-os primeiro.',
      );
    }
  }

  async findById(id: string, tx?: Prisma.TransactionClient): Promise<Company> {
    const db = tx ?? this.prisma;
    const company = await db.company.findFirst({
      where: { id, deletedAt: null },
    });
    if (!company) {
      throw new NotFoundException('Empresa não encontrada');
    }
    return company;
  }

  async list(
    filters: ListCompaniesFilters,
    pagination: ListCompaniesPagination,
  ): Promise<ListCompaniesResult> {
    const decoded = decodeCursor(pagination.cursor);
    const conditions: Prisma.CompanyWhereInput[] = [];

    if (filters.search) {
      conditions.push({
        OR: [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { slug: { contains: filters.search, mode: 'insensitive' } },
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

    const where: Prisma.CompanyWhereInput = {
      ...(filters.active !== false ? { deletedAt: null, active: true } : {}),
      ...(conditions.length > 0 ? { AND: conditions } : {}),
    };

    const items = await this.prisma.company.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pagination.limit + 1,
    });

    const hasMore = items.length > pagination.limit;
    const trimmed = hasMore ? items.slice(0, pagination.limit) : items;
    const last = trimmed[trimmed.length - 1];
    const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

    return { items: trimmed, nextCursor, hasMore };
  }

  async update(
    id: string,
    patch: Prisma.CompanyUpdateInput,
    tx: Prisma.TransactionClient,
  ): Promise<Company> {
    const existing = await this.findById(id, tx);

    // Defesa em profundidade: schema do PATCH não aceita slug, mas se vazar,
    // o domain ignora.
    const sanitizedPatch: Prisma.CompanyUpdateInput = { ...patch };
    if ('slug' in sanitizedPatch) {
      delete (sanitizedPatch as Record<string, unknown>).slug;
    }

    // Se planId mudou, validar que o novo plano está ativo
    const planRef = sanitizedPatch.plan;
    if (planRef && typeof planRef === 'object' && 'connect' in planRef) {
      const planId = (planRef.connect as { id: string }).id;
      if (planId !== existing.planId) {
        await this.assertPlanIsActive(planId, tx);
      }
    }

    return tx.company.update({
      where: { id: existing.id },
      data: sanitizedPatch,
    });
  }

  async create(input: CreateCompanyInput, tx: Prisma.TransactionClient): Promise<Company> {
    await this.assertSlugAvailable(input.slug, tx);
    await this.assertPlanIsActive(input.planId, tx);

    return tx.company.create({
      data: {
        name: input.name,
        slug: input.slug,
        planId: input.planId,
        timezone: input.timezone,
        defaultWorkingHours:
          input.defaultWorkingHours === null
            ? Prisma.DbNull
            : (input.defaultWorkingHours as Prisma.InputJsonValue),
        outOfHoursMessage: input.outOfHoursMessage,
        settings: {
          create: {},
        },
      },
    });
  }

  async softDelete(id: string, tx: Prisma.TransactionClient): Promise<void> {
    const existing = await this.findById(id, tx);
    await this.assertNoActiveUsers(existing.id, tx);
    await tx.company.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });
  }
}
