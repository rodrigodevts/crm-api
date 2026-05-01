import { describe, it, expect, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { getPrisma } from '../setup-prisma';

describe('soft delete behavior', () => {
  beforeEach(async () => {
    const prisma = getPrisma();
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "Department", "Company", "Plan" RESTART IDENTITY CASCADE`,
    );
  });

  it('soft delete (deletedAt != null) NÃO libera unique — comportamento documentado', async () => {
    const prisma = getPrisma();
    const plan = await prisma.plan.create({ data: { name: 'P' } });
    const company = await prisma.company.create({
      data: { planId: plan.id, name: 'C', slug: 'c' },
    });

    const dept = await prisma.department.create({
      data: { companyId: company.id, name: 'Suporte' },
    });

    // Soft delete
    await prisma.department.update({
      where: { id: dept.id },
      data: { deletedAt: new Date() },
    });

    // Tentar criar outro com mesmo nome — DEVE falhar (sem índice parcial)
    await expect(
      prisma.department.create({
        data: { companyId: company.id, name: 'Suporte' },
      }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });

  it('Department soft-deleted ainda é retornado por findMany sem filtro', async () => {
    const prisma = getPrisma();
    const plan = await prisma.plan.create({ data: { name: 'P' } });
    const company = await prisma.company.create({
      data: { planId: plan.id, name: 'C', slug: 'c' },
    });

    const dept = await prisma.department.create({
      data: { companyId: company.id, name: 'X' },
    });
    await prisma.department.update({
      where: { id: dept.id },
      data: { deletedAt: new Date() },
    });

    const all = await prisma.department.findMany({ where: { companyId: company.id } });
    // Sem filtro de deletedAt, soft-deleted aparece — services precisam filtrar manualmente
    expect(all).toHaveLength(1);
    expect(all[0]!.deletedAt).not.toBeNull();
  });
});
