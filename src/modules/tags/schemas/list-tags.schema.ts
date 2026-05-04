import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const ListTagsQuerySchema = z.object({
  active: z.coerce.boolean().optional(),
  scope: z.enum(['CONTACT', 'TICKET', 'BOTH']).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['createdAt', 'name']).default('createdAt'),
});

export class ListTagsQueryDto extends createZodDto(ListTagsQuerySchema) {}
