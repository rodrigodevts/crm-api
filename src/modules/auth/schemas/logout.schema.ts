import { createZodDto } from 'nestjs-zod';
import { RefreshSchema } from './refresh.schema';

export const LogoutSchema = RefreshSchema.describe('Refresh token para revogar (logout do device)');

export class LogoutDto extends createZodDto(LogoutSchema) {}
