import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const Update<%= classify(name) %>Schema = z
  .object({
    // TODO: definir campos do payload
  })
  .describe('TODO: descrever payload de atualização de <%= dasherize(name) %>');

export class Update<%= classify(name) %>Dto extends createZodDto(Update<%= classify(name) %>Schema) {}
