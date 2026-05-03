import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Company, type User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { ZodError } from 'zod';
import { PrismaService } from '../../../database/prisma.service';
import { UsersDomainService } from '../../users/services/users.domain.service';
import type { CompanyWithAdminResponseDto } from '../schemas/company-with-admin-response.schema';
import type {
  CompanyListResponseDto,
  CompanyResponseDto,
} from '../schemas/company-response.schema';
import type { CreateCompanyInput } from '../schemas/create-company.schema';
import type { ListCompaniesQueryInput } from '../schemas/list-companies.schema';
import { UpdateCompanyMeDto, UpdateCompanyMeSchema } from '../schemas/update-company-me.schema';
import { UpdateCompanyDto, UpdateCompanySchema } from '../schemas/update-company.schema';
import { WorkingHoursSchema, type WorkingHoursDto } from '../schemas/working-hours.schema';
import { CompaniesDomainService } from './companies.domain.service';

const SLUG_DUPLICATED = 'Slug já em uso';
const EMAIL_DUPLICATED = 'Email já cadastrado';
const BCRYPT_COST = 12;

@Injectable()
export class CompaniesApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companiesDomain: CompaniesDomainService,
    private readonly usersDomain: UsersDomainService,
  ) {}

  async create(input: CreateCompanyInput): Promise<CompanyWithAdminResponseDto> {
    const passwordHash = await bcrypt.hash(input.admin.password, BCRYPT_COST);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const company = await this.companiesDomain.create(
          {
            name: input.company.name,
            slug: input.company.slug,
            planId: input.company.planId,
            timezone: input.company.timezone,
            defaultWorkingHours: input.company.defaultWorkingHours ?? null,
            outOfHoursMessage: input.company.outOfHoursMessage ?? null,
          },
          tx,
        );

        const admin = await this.usersDomain.create(
          {
            name: input.admin.name,
            email: input.admin.email,
            passwordHash,
            role: 'ADMIN',
            departmentIds: [],
          },
          company.id,
          tx,
        );

        return { company, admin };
      });

      return {
        company: this.toDto(result.company),
        admin: {
          id: result.admin.id,
          companyId: result.admin.companyId,
          name: result.admin.name,
          email: result.admin.email,
          role: result.admin.role,
          absenceMessage: result.admin.absenceMessage,
          absenceActive: result.admin.absenceActive,
          lastSeenAt: result.admin.lastSeenAt ? result.admin.lastSeenAt.toISOString() : null,
          departments: result.admin.departments.map((ud) => ({
            id: ud.department.id,
            name: ud.department.name,
          })),
          createdAt: result.admin.createdAt.toISOString(),
          updatedAt: result.admin.updatedAt.toISOString(),
        },
      };
    } catch (err) {
      throw this.mapConflict(err);
    }
  }

  async list(query: ListCompaniesQueryInput): Promise<CompanyListResponseDto> {
    const filters: { active?: boolean; search?: string } = {};
    if (query.active !== undefined) filters.active = query.active;
    if (query.search !== undefined) filters.search = query.search;

    const pagination: { cursor?: string; limit: number } = { limit: query.limit };
    if (query.cursor !== undefined) pagination.cursor = query.cursor;

    const result = await this.companiesDomain.list(filters, pagination);

    return {
      items: result.items.map((c) => this.toDto(c)),
      pagination: {
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      },
    };
  }

  async findMine(currentUser: User): Promise<CompanyResponseDto> {
    const company = await this.companiesDomain.findById(currentUser.companyId);
    return this.toDto(company);
  }

  async findByIdAuthorized(id: string, currentUser: User): Promise<CompanyResponseDto> {
    if (currentUser.role !== 'SUPER_ADMIN' && id !== currentUser.companyId) {
      // Não vaza existência cross-tenant — mesmo se a Company exista, retorna 404
      throw new NotFoundException('Empresa não encontrada');
    }
    const company = await this.companiesDomain.findById(id);
    return this.toDto(company);
  }

  async updateMine(currentUser: User, input: UpdateCompanyMeDto): Promise<CompanyResponseDto> {
    this.assertStrict(UpdateCompanyMeSchema, input);

    const patch: Prisma.CompanyUpdateInput = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.timezone !== undefined) patch.timezone = input.timezone;
    if ('defaultWorkingHours' in input) {
      patch.defaultWorkingHours =
        input.defaultWorkingHours === null || input.defaultWorkingHours === undefined
          ? Prisma.DbNull
          : input.defaultWorkingHours;
    }
    if ('outOfHoursMessage' in input) {
      patch.outOfHoursMessage = input.outOfHoursMessage ?? null;
    }

    const company = await this.prisma.$transaction((tx) =>
      this.companiesDomain.update(currentUser.companyId, patch, tx),
    );
    return this.toDto(company);
  }

  async updateById(id: string, input: UpdateCompanyDto): Promise<CompanyResponseDto> {
    this.assertStrict(UpdateCompanySchema, input);

    const patch: Prisma.CompanyUpdateInput = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.timezone !== undefined) patch.timezone = input.timezone;
    if ('defaultWorkingHours' in input) {
      patch.defaultWorkingHours =
        input.defaultWorkingHours === null || input.defaultWorkingHours === undefined
          ? Prisma.DbNull
          : input.defaultWorkingHours;
    }
    if ('outOfHoursMessage' in input) {
      patch.outOfHoursMessage = input.outOfHoursMessage ?? null;
    }
    if (input.planId !== undefined) {
      patch.plan = { connect: { id: input.planId } };
    }
    if (input.active !== undefined) {
      patch.active = input.active;
    }

    const company = await this.prisma.$transaction((tx) =>
      this.companiesDomain.update(id, patch, tx),
    );
    return this.toDto(company);
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.$transaction((tx) => this.companiesDomain.softDelete(id, tx));
  }

  protected toDto(company: Company): CompanyResponseDto {
    return {
      id: company.id,
      planId: company.planId,
      name: company.name,
      slug: company.slug,
      active: company.active,
      timezone: company.timezone,
      defaultWorkingHours: this.parseWorkingHours(company.defaultWorkingHours),
      outOfHoursMessage: company.outOfHoursMessage,
      createdAt: company.createdAt.toISOString(),
      updatedAt: company.updatedAt.toISOString(),
    };
  }

  private parseWorkingHours(value: Prisma.JsonValue): WorkingHoursDto | null {
    if (value === null || value === undefined) return null;
    try {
      return WorkingHoursSchema.parse(value);
    } catch {
      // Banco contém Json malformado — não deveria acontecer porque escrevemos
      // sempre via WorkingHoursSchema. Se vier corrompido, retorna null em vez
      // de explodir. Aviso para futuro: investigar AuditLog quando ocorrer.
      return null;
    }
  }

  protected mapConflict(err: unknown): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined) ?? [];
      if (target.includes('slug')) return new ConflictException(SLUG_DUPLICATED);
      if (target.includes('email')) return new ConflictException(EMAIL_DUPLICATED);
    }
    return err;
  }

  protected assertStrict(schema: { parse: (value: unknown) => unknown }, input: unknown): void {
    try {
      schema.parse(input);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({
          message: 'Validação falhou',
          errors: error.issues.map((issue) => ({
            field: issue.path.join('.') || '<root>',
            message: issue.message,
            code: issue.code,
          })),
        });
      }
      throw error;
    }
  }
}
