import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const CreateTagSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Nome é obrigatório')
      .max(100, 'Máximo 100 caracteres')
      .describe('Nome único da tag dentro do tenant'),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, 'Cor deve estar no formato #RRGGBB')
      .transform((s) => s.toUpperCase())
      .describe('Cor hex no formato #RRGGBB; normalizada para uppercase'),
    scope: z
      .enum(['CONTACT', 'TICKET', 'BOTH'])
      .default('BOTH')
      .describe('Onde a tag pode ser aplicada: contato, ticket ou ambos'),
    active: z.boolean().default(true),
  })
  .strict();

export class CreateTagDto extends createZodDto(CreateTagSchema) {}
