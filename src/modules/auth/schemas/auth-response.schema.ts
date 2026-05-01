import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { UserPublicSchema } from './user-public.schema';

export const AuthResponseSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
    user: UserPublicSchema,
  })
  .describe('Par de tokens + dados do usuário autenticado');

export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export class AuthResponseDto extends createZodDto(AuthResponseSchema) {}
