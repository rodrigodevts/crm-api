import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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

@Injectable()
export class TagsDomainService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string, companyId: string, tx?: Prisma.TransactionClient): Promise<Tag> {
    const db: Db = tx ?? this.prisma;
    const tag = await db.tag.findFirst({ where: { id, companyId } });
    if (!tag) throw new NotFoundException('Tag não encontrada');
    return tag;
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
