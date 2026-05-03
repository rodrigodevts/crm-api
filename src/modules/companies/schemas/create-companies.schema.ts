import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateCompaniesSchema = z
  .object({
    // TODO: definir campos do payload
  })
  .describe('TODO: descrever payload de criação de companies');

export class CreateCompaniesDto extends createZodDto(CreateCompaniesSchema) {}
