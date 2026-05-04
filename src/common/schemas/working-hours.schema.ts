import { z } from 'zod';

const TimeRangeSchema = z
  .object({
    from: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
    to: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
  })
  .strict();

export const WorkingHoursSchema = z
  .object({
    monday: z.array(TimeRangeSchema).default([]),
    tuesday: z.array(TimeRangeSchema).default([]),
    wednesday: z.array(TimeRangeSchema).default([]),
    thursday: z.array(TimeRangeSchema).default([]),
    friday: z.array(TimeRangeSchema).default([]),
    saturday: z.array(TimeRangeSchema).default([]),
    sunday: z.array(TimeRangeSchema).default([]),
    holiday: z.array(TimeRangeSchema).default([]),
  })
  .strict()
  .describe('Horário de funcionamento por dia da semana (e feriado).');

export type WorkingHoursDto = z.infer<typeof WorkingHoursSchema>;
