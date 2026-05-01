import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const Create<%= classify(name) %>Schema = z
  .object({
    // TODO: definir campos do payload
  })
  .describe('TODO: descrever payload de criação de <%= dasherize(name) %>');

export class Create<%= classify(name) %>Dto extends createZodDto(Create<%= classify(name) %>Schema) {}
