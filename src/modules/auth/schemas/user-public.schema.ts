import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const UserPublicSchema = z
  .object({
    id: z.string().uuid(),
    companyId: z.string().uuid(),
    name: z.string(),
    email: z.string().email(),
    role: z.enum(['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'AGENT']),
  })
  .describe('Dados públicos do usuário (sem hash de senha)');

export type UserPublic = z.infer<typeof UserPublicSchema>;
export class UserPublicDto extends createZodDto(UserPublicSchema) {}
