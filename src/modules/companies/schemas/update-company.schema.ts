import { z } from 'zod';
import { WorkingHoursSchema } from './working-hours.schema';

export const UpdateCompanySchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    timezone: z.string().min(1).max(64).optional(),
    defaultWorkingHours: WorkingHoursSchema.nullable().optional(),
    outOfHoursMessage: z.string().max(2000).nullable().optional(),
    planId: z.string().uuid().optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .describe('Campos editáveis pelo SUPER_ADMIN. Não inclui slug (imutável).');

export type UpdateCompanyDto = z.infer<typeof UpdateCompanySchema>;
