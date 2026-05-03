import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ListCompaniesQuerySchema = z
  .object({
    active: z.coerce.boolean().optional().default(true),
    search: z.string().trim().min(1).max(100).optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .describe('Filtros para listagem de empresas (SUPER_ADMIN)');

export type ListCompaniesQueryInput = z.infer<typeof ListCompaniesQuerySchema>;
export class ListCompaniesQueryDto extends createZodDto(ListCompaniesQuerySchema) {}
