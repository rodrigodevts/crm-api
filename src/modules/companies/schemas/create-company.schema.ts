import { z } from 'zod';
import { WorkingHoursSchema } from './working-hours.schema';

const SlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Slug deve ter no mínimo 3 caracteres')
  .max(63, 'Slug deve ter no máximo 63 caracteres')
  .regex(
    /^[a-z0-9](-?[a-z0-9]+)*$/,
    'Slug deve conter apenas letras minúsculas, números e hífens, sem hífens consecutivos ou nas pontas',
  );

export const CreateCompanySchema = z
  .object({
    company: z
      .object({
        name: z.string().trim().min(2, 'Nome deve ter no mínimo 2 caracteres').max(100),
        slug: SlugSchema,
        planId: z.string().uuid('planId em formato UUID inválido'),
        timezone: z.string().min(1).max(64).default('America/Sao_Paulo'),
        defaultWorkingHours: WorkingHoursSchema.nullable().optional(),
        outOfHoursMessage: z.string().max(2000).nullable().optional(),
      })
      .strict()
      .describe('Dados da empresa (tenant) sendo criada'),
    admin: z
      .object({
        name: z.string().trim().min(2).max(100),
        email: z.string().trim().toLowerCase().email('Email em formato inválido'),
        password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres').max(128),
      })
      .strict()
      .describe('Primeiro ADMIN do tenant — criado junto com a empresa'),
  })
  .strict()
  .describe('Cria empresa + CompanySettings (defaults) + 1º ADMIN do tenant em uma transação');

export type CreateCompanyDto = z.infer<typeof CreateCompanySchema>;
