import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { PrismaService } from '@/database/prisma.service';
import { encodeCursor } from '@/common/cursor';
import type { WorkingHoursDto } from '@/common/schemas/working-hours.schema';
import type { CreateDepartmentDto } from '../schemas/create-department.schema';
import type { ListDepartmentsQueryDto } from '../schemas/list-departments.schema';
import {
  UpdateDepartmentSchema,
  type UpdateDepartmentDto,
} from '../schemas/update-department.schema';
import type {
  DepartmentListResponseDto,
  DepartmentResponseDto,
} from '../schemas/department-response.schema';
import type { DepartmentDetailResponseDto } from '../schemas/department-detail-response.schema';
import { DepartmentsDomainService, type CreateDepartmentInput } from './departments.domain.service';

type DepartmentEntity = Awaited<ReturnType<DepartmentsDomainService['findById']>>;
type DepartmentWithUsers = Awaited<ReturnType<DepartmentsDomainService['findByIdWithUsers']>>;

@Injectable()
export class DepartmentsApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly domain: DepartmentsDomainService,
  ) {}

  async create(input: CreateDepartmentDto, companyId: string): Promise<DepartmentResponseDto> {
    const domainInput: CreateDepartmentInput = {
      name: input.name,
      active: input.active,
      distributionMode: input.distributionMode,
    };
    if (input.greetingMessage !== undefined) domainInput.greetingMessage = input.greetingMessage;
    if (input.outOfHoursMessage !== undefined)
      domainInput.outOfHoursMessage = input.outOfHoursMessage;
    if (input.workingHours !== undefined) {
      domainInput.workingHours = input.workingHours === null ? null : input.workingHours;
    }
    if (input.slaResponseMinutes !== undefined)
      domainInput.slaResponseMinutes = input.slaResponseMinutes;
    if (input.slaResolutionMinutes !== undefined)
      domainInput.slaResolutionMinutes = input.slaResolutionMinutes;

    try {
      const department = await this.prisma.$transaction((tx) =>
        this.domain.create(domainInput, companyId, tx),
      );
      return this.toDto(department);
    } catch (err) {
      throw this.mapConflict(err);
    }
  }

  async list(
    companyId: string,
    query: ListDepartmentsQueryDto,
  ): Promise<DepartmentListResponseDto> {
    const { items, hasMore } = await this.domain.list(
      companyId,
      { active: query.active, search: query.search, sort: query.sort },
      { cursor: query.cursor, limit: query.limit },
    );

    let nextCursor: string | null = null;
    if (hasMore && items.length > 0) {
      const last = items[items.length - 1]!;
      nextCursor =
        query.sort === 'name'
          ? encodeCursor({ name: last.name, id: last.id })
          : encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id });
    }

    return {
      items: items.map((d) => this.toDto(d)),
      pagination: { nextCursor, hasMore },
    };
  }

  async findById(id: string, companyId: string): Promise<DepartmentDetailResponseDto> {
    const dept = await this.domain.findByIdWithUsers(id, companyId);
    return this.toDetailDto(dept);
  }

  async update(
    id: string,
    companyId: string,
    input: UpdateDepartmentDto,
  ): Promise<DepartmentResponseDto> {
    // Re-parse explícito (defesa-em-profundidade contra ZodValidationPipe global
    // não enforçar .strict() quando o schema é consumido via createZodDto).
    // Padrão Sprint 0.4 (PATCH /me) e 0.5 (PATCH /companies/me + PATCH /:id).
    try {
      UpdateDepartmentSchema.parse(input);
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

    const patch: Prisma.DepartmentUpdateInput = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.active !== undefined) patch.active = input.active;
    if ('greetingMessage' in input) patch.greetingMessage = input.greetingMessage ?? null;
    if ('outOfHoursMessage' in input) patch.outOfHoursMessage = input.outOfHoursMessage ?? null;
    if ('workingHours' in input) {
      patch.workingHours = input.workingHours ?? Prisma.DbNull;
    }
    if ('slaResponseMinutes' in input) {
      patch.slaResponseMinutes = input.slaResponseMinutes ?? null;
    }
    if ('slaResolutionMinutes' in input) {
      patch.slaResolutionMinutes = input.slaResolutionMinutes ?? null;
    }
    if (input.distributionMode !== undefined) patch.distributionMode = input.distributionMode;

    try {
      const department = await this.prisma.$transaction((tx) =>
        this.domain.update(id, companyId, patch, tx),
      );
      return this.toDto(department);
    } catch (err) {
      throw this.mapConflict(err);
    }
  }

  async softDelete(id: string, companyId: string): Promise<void> {
    await this.prisma.$transaction((tx) => this.domain.softDelete(id, companyId, tx));
  }

  private toDto(d: DepartmentEntity): DepartmentResponseDto {
    return {
      id: d.id,
      companyId: d.companyId,
      name: d.name,
      active: d.active,
      greetingMessage: d.greetingMessage,
      outOfHoursMessage: d.outOfHoursMessage,
      workingHours: d.workingHours as WorkingHoursDto | null,
      slaResponseMinutes: d.slaResponseMinutes,
      slaResolutionMinutes: d.slaResolutionMinutes,
      distributionMode: d.distributionMode,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    };
  }

  private toDetailDto(d: DepartmentWithUsers): DepartmentDetailResponseDto {
    const users = d.users
      .map((ud) => ({ id: ud.user.id, name: ud.user.name, role: ud.user.role }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { ...this.toDto(d), users };
  }

  private mapConflict(err: unknown): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined) ?? [];
      if (
        target.includes('name') ||
        target.some((t) => t.includes('companyId') && t.includes('name'))
      ) {
        return new ConflictException('Já existe um departamento com este nome');
      }
    }
    return err;
  }
}
