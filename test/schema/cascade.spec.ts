import { describe, it, expect, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { getPrisma } from '../setup-prisma';

describe('FK cascade behavior', () => {
  beforeEach(async () => {
    const prisma = getPrisma();
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "CloseReasonDepartment", "CloseReason", "Department", "UserDepartment", "User", "CompanySettings", "Company", "Plan" RESTART IDENTITY CASCADE`,
    );
  });

  it('Cascade: deletar Company remove CompanySettings (1:1)', async () => {
    const prisma = getPrisma();
    const plan = await prisma.plan.create({ data: { name: 'P' } });
    const company = await prisma.company.create({
      data: {
        planId: plan.id,
        name: 'C',
        slug: 'c',
        settings: { create: {} },
      },
      include: { settings: true },
    });
    expect(company.settings).not.toBeNull();

    await prisma.company.delete({ where: { id: company.id } });

    const settings = await prisma.companySettings.findUnique({
      where: { companyId: company.id },
    });
    expect(settings).toBeNull();
  });

  it('Cascade: deletar CloseReason remove suas CloseReasonDepartment', async () => {
    const prisma = getPrisma();
    const plan = await prisma.plan.create({ data: { name: 'P' } });
    const company = await prisma.company.create({
      data: { planId: plan.id, name: 'C', slug: 'c' },
    });
    const dept = await prisma.department.create({
      data: { companyId: company.id, name: 'D' },
    });
    const reason = await prisma.closeReason.create({
      data: {
        companyId: company.id,
        name: 'Resolvido',
        departments: { create: { departmentId: dept.id } },
      },
    });

    const before = await prisma.closeReasonDepartment.count();
    expect(before).toBe(1);

    await prisma.closeReason.delete({ where: { id: reason.id } });

    const after = await prisma.closeReasonDepartment.count();
    expect(after).toBe(0);

    // Department continua existindo
    const dpt = await prisma.department.findUnique({ where: { id: dept.id } });
    expect(dpt).not.toBeNull();
  });

  it('Restrict: deletar Department com User vinculado falha', async () => {
    const prisma = getPrisma();
    const plan = await prisma.plan.create({ data: { name: 'P' } });
    const company = await prisma.company.create({
      data: { planId: plan.id, name: 'C', slug: 'c' },
    });
    const dept = await prisma.department.create({
      data: { companyId: company.id, name: 'D' },
    });
    const user = await prisma.user.create({
      data: {
        companyId: company.id,
        name: 'U',
        email: 'u@u.com',
        passwordHash: 'h',
        role: 'AGENT',
        departments: { create: { departmentId: dept.id } },
      },
    });

    await expect(prisma.department.delete({ where: { id: dept.id } })).rejects.toThrow(
      Prisma.PrismaClientKnownRequestError,
    );

    // User intacto
    const u = await prisma.user.findUnique({ where: { id: user.id } });
    expect(u).not.toBeNull();
  });
});
