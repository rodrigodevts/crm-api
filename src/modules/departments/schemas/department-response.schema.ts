import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const DepartmentsResponseSchema = z
  .object({
    id: z.string().uuid(),
    // TODO: definir campos da resposta
  })
  .describe('TODO: descrever resposta de departments');

export class DepartmentsResponseDto extends createZodDto(DepartmentsResponseSchema) {}
