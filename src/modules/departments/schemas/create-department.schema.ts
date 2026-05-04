import { DepartmentDistributionMode } from '@prisma/client';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { WorkingHoursSchema } from '@/common/schemas/working-hours.schema';

export const CreateDepartmentSchema = z
  .object({
    name: z.string().trim().min(2, 'Nome deve ter no mínimo 2 caracteres').max(100),
    active: z.boolean().default(true),
    greetingMessage: z.string().max(2000).nullable().optional(),
    outOfHoursMessage: z.string().max(2000).nullable().optional(),
    workingHours: WorkingHoursSchema.nullable().optional(),
    slaResponseMinutes: z.number().int().min(1).max(43200).nullable().optional(),
    slaResolutionMinutes: z.number().int().min(1).max(43200).nullable().optional(),
    distributionMode: z.nativeEnum(DepartmentDistributionMode).default('MANUAL'),
  })
  .strict()
  .describe('Dados para criar departamento');

export type CreateDepartmentDto = z.infer<typeof CreateDepartmentSchema>;
export class CreateDepartmentDtoClass extends createZodDto(CreateDepartmentSchema) {}
