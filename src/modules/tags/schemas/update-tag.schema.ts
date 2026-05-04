import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const UpdateTagSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Nome é obrigatório')
      .max(100, 'Máximo 100 caracteres')
      .optional(),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, 'Cor deve estar no formato #RRGGBB')
      .transform((s) => s.toUpperCase())
      .optional(),
    scope: z.enum(['CONTACT', 'TICKET', 'BOTH']).optional(),
    active: z.boolean().optional(),
  })
  .strict();

export class UpdateTagDto extends createZodDto(UpdateTagSchema) {}
