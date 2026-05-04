import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const TagResponseSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  name: z.string(),
  color: z.string(),
  scope: z.enum(['CONTACT', 'TICKET', 'BOTH']),
  active: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export class TagResponseDto extends createZodDto(TagResponseSchema) {}

export const TagListResponseSchema = z.object({
  items: z.array(TagResponseSchema),
  pagination: z.object({
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  }),
});

export class TagListResponseDto extends createZodDto(TagListResponseSchema) {}
