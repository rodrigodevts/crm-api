import { BadRequestException } from '@nestjs/common';

export interface DecodedCursor {
  createdAt: Date;
  id: string;
}

export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id }), 'utf8').toString(
    'base64url',
  );
}

export function decodeCursor(cursor: string | undefined): DecodedCursor | null {
  if (cursor === undefined) return null;
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as { createdAt: string; id: string };
    return { createdAt: new Date(parsed.createdAt), id: parsed.id };
  } catch {
    throw new BadRequestException('Cursor inválido');
  }
}
