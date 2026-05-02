import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const UpdateMeSchema = z
  .object({
    name: z.string().trim().min(2, 'Nome deve ter no mínimo 2 caracteres').max(100).optional(),
    password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres').max(128).optional(),
    absenceMessage: z.string().max(500).nullable().optional(),
    absenceActive: z.boolean().optional(),
  })
  .strict()
  .describe('Dados que o próprio usuário pode editar');

export type UpdateMeInput = z.infer<typeof UpdateMeSchema>;
export class UpdateMeDto extends createZodDto(UpdateMeSchema) {}
