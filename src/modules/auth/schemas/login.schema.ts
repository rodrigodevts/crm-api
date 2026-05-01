import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const LoginSchema = z
  .object({
    email: z.string().email('E-mail em formato inválido').toLowerCase().trim(),
    password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
  })
  .describe('Credenciais de login');

export type LoginInput = z.infer<typeof LoginSchema>;
export class LoginDto extends createZodDto(LoginSchema) {}
