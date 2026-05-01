import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const DepartmentRefSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
});

export const UserResponseSchema = z
  .object({
    id: z.string().uuid(),
    companyId: z.string().uuid(),
    name: z.string(),
    email: z.string().email(),
    role: z.enum(['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'AGENT']),
    absenceMessage: z.string().nullable(),
    absenceActive: z.boolean(),
    lastSeenAt: z.string().datetime().nullable(),
    departments: z.array(DepartmentRefSchema),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .describe('Usuário do tenant com departamentos populados');

export const UserListResponseSchema = z.object({
  items: z.array(UserResponseSchema),
  pagination: z.object({
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  }),
});

export type UserResponse = z.infer<typeof UserResponseSchema>;
export type UserListResponse = z.infer<typeof UserListResponseSchema>;
export class UserResponseDto extends createZodDto(UserResponseSchema) {}
export class UserListResponseDto extends createZodDto(UserListResponseSchema) {}
