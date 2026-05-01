import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const UserResponseSchema = z
  .object({
    id: z.string().uuid(),
    // TODO: definir campos da resposta
  })
  .describe('TODO: descrever resposta de users');

export class UserResponseDto extends createZodDto(UserResponseSchema) {}
