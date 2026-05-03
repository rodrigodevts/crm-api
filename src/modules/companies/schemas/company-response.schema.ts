import { z } from 'zod';
import { WorkingHoursSchema } from './working-hours.schema';

export const CompanyResponseSchema = z
  .object({
    id: z.string().uuid(),
    planId: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    active: z.boolean(),
    timezone: z.string(),
    defaultWorkingHours: WorkingHoursSchema.nullable(),
    outOfHoursMessage: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .describe('Empresa (tenant). Sem settings, sem deletedAt.');

export const CompanyListResponseSchema = z.object({
  items: z.array(CompanyResponseSchema),
  pagination: z.object({
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  }),
});

export type CompanyResponseDto = z.infer<typeof CompanyResponseSchema>;
export type CompanyListResponseDto = z.infer<typeof CompanyListResponseSchema>;
