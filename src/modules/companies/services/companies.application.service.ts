import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma, type Company } from '@prisma/client';
import { ZodError } from 'zod';
import { PrismaService } from '../../../database/prisma.service';
import { UsersDomainService } from '../../users/services/users.domain.service';
import type { CompanyResponseDto } from '../schemas/company-response.schema';
import { WorkingHoursSchema, type WorkingHoursDto } from '../schemas/working-hours.schema';
import { CompaniesDomainService } from './companies.domain.service';

const SLUG_DUPLICATED = 'Slug já em uso';
const EMAIL_DUPLICATED = 'Email já cadastrado';

@Injectable()
export class CompaniesApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companiesDomain: CompaniesDomainService,
    private readonly usersDomain: UsersDomainService,
  ) {}

  // Public methods are added in subsequent tasks (15, 16, 17, 18, 19, 20, 21).

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
