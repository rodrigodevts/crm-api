import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const RefreshSchema = z
  .object({
    refreshToken: z.string().min(1, 'Refresh token obrigatório'),
  })
  .describe('Refresh token para renovar par de tokens');

export type RefreshInput = z.infer<typeof RefreshSchema>;
export class RefreshDto extends createZodDto(RefreshSchema) {}
