import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CompaniesResponseSchema = z
  .object({
    id: z.string().uuid(),
    // TODO: definir campos da resposta
  })
  .describe('TODO: descrever resposta de companies');

export class CompaniesResponseDto extends createZodDto(CompaniesResponseSchema) {}
