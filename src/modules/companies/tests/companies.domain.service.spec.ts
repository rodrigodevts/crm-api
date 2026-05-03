import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { CompaniesDomainService } from '../services/companies.domain.service';
import type { PrismaService } from '../../../database/prisma.service';

const fakeTx = (overrides: Record<string, unknown> = {}): unknown => ({
  company: {
    findFirst: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
    ...overrides,
  },
  user: {
    count: vi.fn(),
  },
  plan: {
    findFirst: vi.fn(),
  },
});

describe('CompaniesDomainService', () => {
  let service: CompaniesDomainService;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = {} as PrismaService;
    service = new CompaniesDomainService(prisma);
  });

  describe('assertSlugAvailable', () => {
    it('passes when no company has the slug', async () => {
      const tx = fakeTx();
      (
        tx as { company: { findFirst: ReturnType<typeof vi.fn> } }
      ).company.findFirst.mockResolvedValue(null);
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
        service.assertSlugAvailable('acme', tx as any),
      ).resolves.toBeUndefined();
    });

    it('throws ConflictException when slug is already taken by another company', async () => {
      const tx = fakeTx();
      (
        tx as { company: { findFirst: ReturnType<typeof vi.fn> } }
      ).company.findFirst.mockResolvedValue({
        id: 'existing-uuid',
        slug: 'acme',
      });
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
        service.assertSlugAvailable('acme', tx as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('passes when slug is taken but exceptId matches the existing row', async () => {
      const tx = fakeTx();
      (
        tx as { company: { findFirst: ReturnType<typeof vi.fn> } }
      ).company.findFirst.mockResolvedValue({
        id: 'self-uuid',
        slug: 'acme',
      });
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
        service.assertSlugAvailable('acme', tx as any, 'self-uuid'),
      ).resolves.toBeUndefined();
    });
  });

  describe('assertPlanIsActive', () => {
    it('passes when plan exists and is active', async () => {
      const tx = fakeTx();
      (tx as { plan: { findFirst: ReturnType<typeof vi.fn> } }).plan.findFirst.mockResolvedValue({
        id: 'plan-uuid',
        active: true,
      });
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
        service.assertPlanIsActive('plan-uuid', tx as any),
      ).resolves.toBeUndefined();
    });

    it('throws UnprocessableEntityException when plan is inactive', async () => {
      const tx = fakeTx();
      (tx as { plan: { findFirst: ReturnType<typeof vi.fn> } }).plan.findFirst.mockResolvedValue(
        null,
      );
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
        service.assertPlanIsActive('plan-uuid', tx as any),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('throws UnprocessableEntityException when plan does not exist', async () => {
      const tx = fakeTx();
      (tx as { plan: { findFirst: ReturnType<typeof vi.fn> } }).plan.findFirst.mockResolvedValue(
        null,
      );
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
        service.assertPlanIsActive('missing-uuid', tx as any),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });
});
