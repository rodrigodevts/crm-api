import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const UpdateCompaniesSchema = z
  .object({
    // TODO: definir campos do payload
  })
  .describe('TODO: descrever payload de atualização de companies');

export class UpdateCompaniesDto extends createZodDto(UpdateCompaniesSchema) {}
