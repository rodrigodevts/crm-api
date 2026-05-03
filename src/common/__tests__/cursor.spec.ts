import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { encodeCursor, decodeCursor } from '../cursor';

describe('cursor helper', () => {
  it('encodes and decodes round-trip', () => {
    const createdAt = new Date('2026-04-27T15:30:00.000Z');
    const id = '01934aaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const encoded = encodeCursor(createdAt, id);
    const decoded = decodeCursor(encoded);
    expect(decoded?.createdAt.toISOString()).toBe(createdAt.toISOString());
    expect(decoded?.id).toBe(id);
  });

  it('returns null when cursor is undefined', () => {
    expect(decodeCursor(undefined)).toBeNull();
  });

  it('throws BadRequestException on malformed cursor', () => {
    expect(() => decodeCursor('not-base64-json!!')).toThrow(BadRequestException);
  });
});
