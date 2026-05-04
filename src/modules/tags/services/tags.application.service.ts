import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma, type Tag, type User } from '@prisma/client';
import { ZodError } from 'zod';
import { PrismaService } from '@/database/prisma.service';
import { encodeCursor } from '@/common/cursor';
import { ROLE_WEIGHT } from '@/common/guards/roles.guard';
import type { CreateTagDto } from '../schemas/create-tag.schema';
import { UpdateTagSchema, type UpdateTagDto } from '../schemas/update-tag.schema';
import type { ListTagsQueryDto } from '../schemas/list-tags.schema';
import type { DeleteTagQueryDto } from '../schemas/delete-tag.schema';
import type { TagListResponseDto, TagResponseDto } from '../schemas/tag-response.schema';
import { TagsDomainService, type CreateTagInput } from './tags.domain.service';

@Injectable()
export class TagsApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly domain: TagsDomainService,
  ) {}

  async create(input: CreateTagDto, companyId: string): Promise<TagResponseDto> {
    const domainInput: CreateTagInput = {
      name: input.name,
      color: input.color,
      scope: input.scope,
      active: input.active,
    };
    try {
      const tag = await this.prisma.$transaction((tx) =>
        this.domain.create(domainInput, companyId, tx),
      );
      return this.toDto(tag);
    } catch (err) {
      throw this.mapConflict(err);
    }
  }

  async list(companyId: string, query: ListTagsQueryDto): Promise<TagListResponseDto> {
    const filters = {
      sort: query.sort,
      ...(query.active !== undefined ? { active: query.active } : {}),
      ...(query.scope !== undefined ? { scope: query.scope } : {}),
      ...(query.search !== undefined ? { search: query.search } : {}),
    };
    const pagination = {
      limit: query.limit,
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
    };
    const { items, hasMore } = await this.domain.list(companyId, filters, pagination);

    let nextCursor: string | null = null;
    if (hasMore && items.length > 0) {
      const last = items[items.length - 1]!;
      nextCursor =
        query.sort === 'name'
          ? encodeCursor({ name: last.name, id: last.id })
          : encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id });
    }

    return {
      items: items.map((t) => this.toDto(t)),
      pagination: { nextCursor, hasMore },
    };
  }

  async findById(id: string, companyId: string): Promise<TagResponseDto> {
    const tag = await this.domain.findById(id, companyId);
    return this.toDto(tag);
  }

  async update(id: string, companyId: string, input: UpdateTagDto): Promise<TagResponseDto> {
    // Re-parse defense-in-depth (pattern Sprint 0.4/0.5/0.6) — guards against
    // ZodValidationPipe global not enforcing .strict() when consumed via createZodDto.
    try {
      UpdateTagSchema.parse(input);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({
          message: 'Validação falhou',
          errors: error.issues.map((i) => ({
            field: i.path.join('.') || '<root>',
            message: i.message,
            code: i.code,
          })),
        });
      }
      throw error;
    }

    const patch: Prisma.TagUpdateInput = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.color !== undefined) patch.color = input.color;
    if (input.scope !== undefined) patch.scope = input.scope;
    if (input.active !== undefined) patch.active = input.active;

    try {
      const tag = await this.prisma.$transaction((tx) =>
        this.domain.update(id, companyId, patch, tx),
      );
      return this.toDto(tag);
    } catch (err) {
      throw this.mapConflict(err);
    }
  }

  async delete(id: string, companyId: string, user: User, query: DeleteTagQueryDto): Promise<void> {
    if (query.hard) {
      if (ROLE_WEIGHT[user.role] < ROLE_WEIGHT.ADMIN) {
        throw new ForbiddenException('Apenas ADMIN pode excluir definitivamente');
      }
      await this.prisma.$transaction(async (tx) => {
        const tag = await this.domain.findByIdWithCounts(id, companyId, tx);
        const total = tag._count.contactTags + tag._count.ticketTags;
        if (total > 0) {
          throw new ConflictException(
            `Não é possível excluir definitivamente: há ${total} atribuição(ões). Remova-as antes.`,
          );
        }
        await this.domain.hardDelete(id, companyId, tx);
      });
      return;
    }
    await this.prisma.$transaction((tx) => this.domain.softDelete(id, companyId, tx));
  }

  private toDto(t: Tag): TagResponseDto {
    return {
      id: t.id,
      companyId: t.companyId,
      name: t.name,
      color: t.color,
      scope: t.scope,
      active: t.active,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }

  private mapConflict(err: unknown): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined) ?? [];
      if (
        target.includes('name') ||
        target.some((t) => t.includes('companyId') && t.includes('name'))
      ) {
        return new ConflictException('Já existe uma tag com este nome');
      }
    }
    return err;
  }
}
