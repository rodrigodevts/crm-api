import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
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

  describe('assertNoActiveUsers', () => {
    it('passes when count of active users is zero', async () => {
      const tx = fakeTx();
      (tx as { user: { count: ReturnType<typeof vi.fn> } }).user.count.mockResolvedValue(0);
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
        service.assertNoActiveUsers('company-uuid', tx as any),
      ).resolves.toBeUndefined();
    });

    it('throws ConflictException when at least one active user exists', async () => {
      const tx = fakeTx();
      (tx as { user: { count: ReturnType<typeof vi.fn> } }).user.count.mockResolvedValue(1);
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
        service.assertNoActiveUsers('company-uuid', tx as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('filters by companyId and deletedAt: null in the count query', async () => {
      const tx = fakeTx();
      const countMock = (tx as { user: { count: ReturnType<typeof vi.fn> } }).user.count;
      countMock.mockResolvedValue(0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      await service.assertNoActiveUsers('company-uuid', tx as any);
      expect(countMock).toHaveBeenCalledWith({
        where: { companyId: 'company-uuid', deletedAt: null },
      });
    });
  });

  describe('update', () => {
    it('ignores patch.slug even if present (defense in depth)', async () => {
      const existing = {
        id: 'company-uuid',
        slug: 'original-slug',
        name: 'Original',
        planId: 'plan-uuid',
        active: true,
        timezone: 'America/Sao_Paulo',
        defaultWorkingHours: null,
        outOfHoursMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      const updateMock = vi.fn().mockResolvedValue({ ...existing, name: 'Renamed' });
      const findFirstMock = vi.fn().mockResolvedValue(existing);
      const tx = {
        company: {
          findFirst: findFirstMock,
          update: updateMock,
        },
        plan: { findFirst: vi.fn() },
        user: { count: vi.fn() },
      };

      // Cast: simula um caller fora do app service que tente vazar slug
      const patch = { name: 'Renamed', slug: 'malicious-new-slug' } as Prisma.CompanyUpdateInput;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      await service.update('company-uuid', patch, tx as any);

      expect(updateMock).toHaveBeenCalledTimes(1);
      const call = updateMock.mock.calls[0]![0] as { data: Record<string, unknown> };
      expect(call.data).not.toHaveProperty('slug');
      expect(call.data).toHaveProperty('name', 'Renamed');
    });
  });

  describe('softDelete', () => {
    it('throws ConflictException when active users exist', async () => {
      const existing = { id: 'company-uuid', deletedAt: null };
      const tx = {
        company: {
          findFirst: vi.fn().mockResolvedValue(existing),
          update: vi.fn(),
        },
        user: {
          count: vi.fn().mockResolvedValue(1),
        },
        plan: { findFirst: vi.fn() },
      };
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
        service.softDelete('company-uuid', tx as any),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.company.update).not.toHaveBeenCalled();
    });

    it('sets deletedAt when no active users exist', async () => {
      const existing = { id: 'company-uuid', deletedAt: null };
      const updateMock = vi.fn().mockResolvedValue({ ...existing, deletedAt: new Date() });
      const tx = {
        company: {
          findFirst: vi.fn().mockResolvedValue(existing),
          update: updateMock,
        },
        user: {
          count: vi.fn().mockResolvedValue(0),
        },
        plan: { findFirst: vi.fn() },
      };
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
        service.softDelete('company-uuid', tx as any),
      ).resolves.toBeUndefined();

      expect(updateMock).toHaveBeenCalledTimes(1);
      const call = updateMock.mock.calls[0]![0] as {
        where: { id: string };
        data: { deletedAt: Date };
      };
      expect(call.where.id).toBe('company-uuid');
      expect(call.data.deletedAt).toBeInstanceOf(Date);
    });
  });
});
