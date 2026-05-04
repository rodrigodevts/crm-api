import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const DeleteTagQuerySchema = z.object({
  hard: z.coerce.boolean().default(false),
});

export class DeleteTagQueryDto extends createZodDto(DeleteTagQuerySchema) {}
