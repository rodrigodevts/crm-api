import { z } from 'zod';

export const ListDepartmentsQuerySchema = z
  .object({
    active: z.coerce.boolean().optional().default(true),
    search: z.string().trim().min(1).max(100).optional(),
    sort: z.enum(['createdAt', 'name']).default('createdAt'),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .describe('Filtros para listagem de departamentos');

export type ListDepartmentsQueryDto = z.infer<typeof ListDepartmentsQuerySchema>;
