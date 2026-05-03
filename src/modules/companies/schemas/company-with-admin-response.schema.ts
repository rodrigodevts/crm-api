import { z } from 'zod';
import { UserResponseSchema } from '../../users/schemas/user-response.schema';
import { CompanyResponseSchema } from './company-response.schema';

export const CompanyWithAdminResponseSchema = z
  .object({
    company: CompanyResponseSchema,
    admin: UserResponseSchema,
  })
  .describe('Resposta de POST /companies — empresa criada + 1º ADMIN');

export type CompanyWithAdminResponseDto = z.infer<typeof CompanyWithAdminResponseSchema>;
