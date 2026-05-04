import { DepartmentDistributionMode } from '@prisma/client';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { WorkingHoursSchema } from '@/common/schemas/working-hours.schema';

export const UpdateDepartmentSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    active: z.boolean().optional(),
    greetingMessage: z.string().max(2000).nullable().optional(),
    outOfHoursMessage: z.string().max(2000).nullable().optional(),
    workingHours: WorkingHoursSchema.nullable().optional(),
    slaResponseMinutes: z.number().int().min(1).max(43200).nullable().optional(),
    slaResolutionMinutes: z.number().int().min(1).max(43200).nullable().optional(),
    distributionMode: z.nativeEnum(DepartmentDistributionMode).optional(),
  })
  .strict()
  .describe('Campos editáveis em departamento. Strict.');

export class UpdateDepartmentDto extends createZodDto(UpdateDepartmentSchema) {}
