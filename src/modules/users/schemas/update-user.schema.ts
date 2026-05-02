import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const UpdateUserSchema = z
  .object({
    name: z.string().trim().min(2, 'Nome deve ter no mínimo 2 caracteres').max(100).optional(),
    email: z.string().trim().toLowerCase().email('Email em formato inválido').optional(),
    password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres').max(128).optional(),
    role: z.enum(['ADMIN', 'SUPERVISOR', 'AGENT']).optional(),
    departmentIds: z.array(z.string().uuid()).optional(),
    absenceMessage: z.string().max(500).nullable().optional(),
    absenceActive: z.boolean().optional(),
  })
  .strict()
  .describe('Dados para editar usuário (apenas ADMIN+)');

export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
export class UpdateUserDto extends createZodDto(UpdateUserSchema) {}
