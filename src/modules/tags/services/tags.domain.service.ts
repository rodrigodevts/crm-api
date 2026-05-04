import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Tag, type TagScope } from '@prisma/client';
import { PrismaService } from '@/database/prisma.service';
import { decodeCursor } from '@/common/cursor';

type Db = PrismaService | Prisma.TransactionClient;

type ListFilters = {
  active?: boolean | undefined;
  scope?: TagScope | undefined;
  search?: string | undefined;
  sort: 'createdAt' | 'name';
};
type ListPagination = { cursor?: string | undefined; limit: number };
type ListResult = { items: Tag[]; hasMore: boolean };

export type CreateTagInput = {
  name: string;
  color: string;
  scope?: TagScope;
  active?: boolean;
};

@Injectable()
export class TagsDomainService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string, companyId: string, tx?: Prisma.TransactionClient): Promise<Tag> {
    const db: Db = tx ?? this.prisma;
    const tag = await db.tag.findFirst({ where: { id, companyId } });
    if (!tag) throw new NotFoundException('Tag não encontrada');
    return tag;
  }

  async create(
    input: CreateTagInput,
    companyId: string,
    tx: Prisma.TransactionClient,
  ): Promise<Tag> {
    await this.assertNameAvailable(input.name, companyId, tx);
    return tx.tag.create({
      data: {
        companyId,
        name: input.name,
        color: input.color,
        ...(input.scope !== undefined ? { scope: input.scope } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });
  }

  async assertNameAvailable(
    name: string,
    companyId: string,
    tx: Prisma.TransactionClient,
    exceptId?: string,
  ): Promise<void> {
    const existing = await tx.tag.findFirst({ where: { companyId, name } });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException('Já existe uma tag com este nome');
    }
  }

  async findByIdWithCounts(
    id: string,
    companyId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Tag & { _count: { contactTags: number; ticketTags: number } }> {
    const db: Db = tx ?? this.prisma;
    const tag = await db.tag.findFirst({
      where: { id, companyId },
      include: { _count: { select: { contactTags: true, ticketTags: true } } },
    });
    if (!tag) throw new NotFoundException('Tag não encontrada');
    return tag;
  }

  async hardDelete(id: string, companyId: string, tx: Prisma.TransactionClient): Promise<void> {
    await this.findById(id, companyId, tx);
    await tx.tag.delete({ where: { id } });
  }

  async softDelete(id: string, companyId: string, tx: Prisma.TransactionClient): Promise<void> {
    await this.findById(id, companyId, tx);
    await tx.tag.update({ where: { id }, data: { active: false } });
  }

  async update(
    id: string,
    companyId: string,
    patch: Prisma.TagUpdateInput,
    tx: Prisma.TransactionClient,
  ): Promise<Tag> {
    const existing = await this.findById(id, companyId, tx);
    if (typeof patch.name === 'string' && patch.name !== existing.name) {
      await this.assertNameAvailable(patch.name, companyId, tx, id);
    }
    return tx.tag.update({ where: { id }, data: patch });
  }

  async list(
    companyId: string,
    filters: ListFilters,
    pagination: ListPagination,
  ): Promise<ListResult> {
    const where: Prisma.TagWhereInput = {
      companyId,
      ...(filters.active !== undefined ? { active: filters.active } : {}),
      ...(filters.search
        ? { name: { contains: filters.search, mode: 'insensitive' as const } }
        : {}),
      ...(filters.scope ? this.scopeFilter(filters.scope) : {}),
    };

    if (filters.sort === 'name') {
      const decoded = decodeCursor<{ name: string; id: string }>(pagination.cursor);
      if (decoded !== null) {
        if (typeof decoded.name !== 'string' || typeof decoded.id !== 'string') {
          throw new BadRequestException('Cursor inválido');
        }
        where.OR = [{ name: { gt: decoded.name } }, { name: decoded.name, id: { gt: decoded.id } }];
      }
      const items = await this.prisma.tag.findMany({
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
    const items = await this.prisma.tag.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pagination.limit + 1,
    });
    const hasMore = items.length > pagination.limit;
    return { items: hasMore ? items.slice(0, pagination.limit) : items, hasMore };
  }

  private scopeFilter(scope: TagScope): Prisma.TagWhereInput {
    if (scope === 'TICKET') return { scope: { in: ['TICKET', 'BOTH'] } };
    if (scope === 'CONTACT') return { scope: { in: ['CONTACT', 'BOTH'] } };
    return { scope: 'BOTH' };
  }
}
