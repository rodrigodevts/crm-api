import { BadRequestException } from '@nestjs/common';

export function encodeCursor(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor<T>(cursor: string | undefined): T | null {
  if (cursor === undefined) return null;
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    return JSON.parse(decoded) as T;
  } catch {
    throw new BadRequestException('Cursor inválido');
  }
}
