import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const HealthResponseSchema = z
  .object({
    status: z.literal('ok').describe('Status fixo "ok" quando a app está viva'),
    uptime: z.number().nonnegative().describe('Uptime do processo em segundos'),
    timestamp: z.string().datetime().describe('Timestamp ISO 8601 UTC'),
  })
  .describe('Resposta do health check');

export class HealthResponseDto extends createZodDto(HealthResponseSchema) {}
