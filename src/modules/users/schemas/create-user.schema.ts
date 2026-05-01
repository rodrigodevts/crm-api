import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateUserSchema = z
  .object({
    // TODO: definir campos do payload
  })
  .describe('TODO: descrever payload de criação de users');

export class CreateUserDto extends createZodDto(CreateUserSchema) {}
