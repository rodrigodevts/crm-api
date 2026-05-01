import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ListUsersQuerySchema = z
  .object({
    role: z.enum(['ADMIN', 'SUPERVISOR', 'AGENT', 'SUPER_ADMIN']).optional(),
    active: z.coerce.boolean().optional().default(true),
    departmentId: z.string().uuid().optional(),
    search: z.string().trim().min(1).max(100).optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .describe('Filtros para listagem de usuários');

export type ListUsersQueryInput = z.infer<typeof ListUsersQuerySchema>;
export class ListUsersQueryDto extends createZodDto(ListUsersQuerySchema) {}
