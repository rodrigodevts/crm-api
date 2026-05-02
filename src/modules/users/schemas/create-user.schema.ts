import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateUserSchema = z
  .object({
    name: z.string().trim().min(2, 'Nome deve ter no mínimo 2 caracteres').max(100),
    email: z.string().trim().toLowerCase().email('Email em formato inválido'),
    password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres').max(128),
    role: z
      .enum(['ADMIN', 'SUPERVISOR', 'AGENT'])
      .describe('Perfil do usuário no tenant. SUPER_ADMIN não é permitido por esta rota.'),
    departmentIds: z
      .array(z.string().uuid())
      .default([])
      .describe('UUIDs dos departamentos. Pode ser vazio.'),
  })
  .strict()
  .describe('Dados para criar usuário no tenant atual');

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export class CreateUserDto extends createZodDto(CreateUserSchema) {}
