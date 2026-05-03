import { z } from 'zod';
import { WorkingHoursSchema } from './working-hours.schema';

export const UpdateCompanyMeSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    timezone: z.string().min(1).max(64).optional(),
    defaultWorkingHours: WorkingHoursSchema.nullable().optional(),
    outOfHoursMessage: z.string().max(2000).nullable().optional(),
  })
  .strict()
  .describe('Campos editáveis pelo ADMIN do próprio tenant');

export type UpdateCompanyMeDto = z.infer<typeof UpdateCompanyMeSchema>;
