import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const UpdateDepartmentsSchema = z
  .object({
    // TODO: definir campos do payload
  })
  .describe('TODO: descrever payload de atualização de departments');

export class UpdateDepartmentsDto extends createZodDto(UpdateDepartmentsSchema) {}
