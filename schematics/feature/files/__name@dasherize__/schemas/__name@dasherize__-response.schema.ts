import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const <%= classify(name) %>ResponseSchema = z
  .object({
    id: z.string().uuid(),
    // TODO: definir campos da resposta
  })
  .describe('TODO: descrever resposta de <%= dasherize(name) %>');

export class <%= classify(name) %>ResponseDto extends createZodDto(<%= classify(name) %>ResponseSchema) {}
