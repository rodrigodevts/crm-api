import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateDepartmentsSchema = z
  .object({
    // TODO: definir campos do payload
  })
  .describe('TODO: descrever payload de criação de departments');

export class CreateDepartmentsDto extends createZodDto(CreateDepartmentsSchema) {}
