import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { encodeCursor, decodeCursor } from '../cursor';

describe('cursor helper', () => {
  describe('encodeCursor', () => {
    it('codifica payload arbitrário em base64url', () => {
      const cursor = encodeCursor({ createdAt: '2026-05-03T00:00:00.000Z', id: 'abc' });
      expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('payloads diferentes produzem cursors diferentes', () => {
      const a = encodeCursor({ name: 'Alice', id: '1' });
      const b = encodeCursor({ name: 'Bob', id: '1' });
      expect(a).not.toEqual(b);
    });

    it('aceita shapes heterogêneos (sort=createdAt vs sort=name)', () => {
      const byCreatedAt = encodeCursor({ createdAt: '2026-05-03T00:00:00.000Z', id: 'a' });
      const byName = encodeCursor({ name: 'Suporte', id: 'a' });
      expect(byCreatedAt).not.toEqual(byName);
    });
  });

  describe('decodeCursor', () => {
    it('round-trip preserva o payload', () => {
      const original = { createdAt: '2026-05-03T00:00:00.000Z', id: 'abc' };
      const cursor = encodeCursor(original);
      const decoded = decodeCursor<{ createdAt: string; id: string }>(cursor);
      expect(decoded).toEqual(original);
    });

    it('retorna null quando cursor é undefined', () => {
      expect(decodeCursor<{ createdAt: string; id: string }>(undefined)).toBeNull();
    });

    it('lança BadRequestException pra base64 quebrado', () => {
      expect(() => decodeCursor<unknown>('!!!not-base64!!!')).toThrow(BadRequestException);
    });

    it('lança BadRequestException pra JSON malformado', () => {
      const broken = Buffer.from('not-json', 'utf8').toString('base64url');
      expect(() => decodeCursor<unknown>(broken)).toThrow(BadRequestException);
    });
  });
});
