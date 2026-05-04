import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { DepartmentResponseSchema } from './department-response.schema';

const UserRefSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'AGENT']),
});

export const DepartmentDetailResponseSchema = DepartmentResponseSchema.extend({
  users: z.array(UserRefSchema),
}).describe('Departamento com lista mínima dos usuários atribuídos');

export class DepartmentDetailResponseDto extends createZodDto(DepartmentDetailResponseSchema) {}
