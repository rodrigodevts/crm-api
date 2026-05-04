import { DepartmentDistributionMode } from '@prisma/client';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { WorkingHoursSchema } from '@/common/schemas/working-hours.schema';

export const DepartmentResponseSchema = z
  .object({
    id: z.string().uuid(),
    companyId: z.string().uuid(),
    name: z.string(),
    active: z.boolean(),
    greetingMessage: z.string().nullable(),
    outOfHoursMessage: z.string().nullable(),
    workingHours: WorkingHoursSchema.nullable(),
    slaResponseMinutes: z.number().nullable(),
    slaResolutionMinutes: z.number().nullable(),
    distributionMode: z.nativeEnum(DepartmentDistributionMode),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .describe('Departamento. Sem deletedAt, sem users.');

export const DepartmentListResponseSchema = z.object({
  items: z.array(DepartmentResponseSchema),
  pagination: z.object({
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  }),
});

export type DepartmentResponseDto = z.infer<typeof DepartmentResponseSchema>;
export type DepartmentListResponseDto = z.infer<typeof DepartmentListResponseSchema>;
export class DepartmentResponseDtoClass extends createZodDto(DepartmentResponseSchema) {}
export class DepartmentListResponseDtoClass extends createZodDto(DepartmentListResponseSchema) {}
