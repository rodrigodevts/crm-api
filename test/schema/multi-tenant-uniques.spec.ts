import { describe, it, expect, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { getPrisma } from '../setup-prisma';

describe('multi-tenant unique constraints', () => {
  beforeEach(async () => {
    const prisma = getPrisma();
    // Truncate em ordem reversa de FK
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "AuditLog", "WebhookDelivery", "WebhookSubscription", "BotCredential", "MessageTemplate", "IntegrationLink", "BusinessHoliday", "CustomFieldDefinition", "ContactTag", "TicketTag", "Contact", "Ticket", "ChatFlow", "ChannelConnection", "LeadStatus", "SalesFunnel", "CloseReasonDepartment", "CloseReason", "QuickReply", "Tag", "UserDepartment", "Department", "RefreshToken", "User", "CompanySettings", "Company", "Plan" RESTART IDENTITY CASCADE`,
    );
  });

  async function setupTwoCompanies(): Promise<{ companyA: string; companyB: string }> {
    const prisma = getPrisma();
    const plan = await prisma.plan.create({ data: { name: 'Test' } });
    const a = await prisma.company.create({
      data: { planId: plan.id, name: 'A', slug: 'a' },
    });
    const b = await prisma.company.create({
      data: { planId: plan.id, name: 'B', slug: 'b' },
    });
    return { companyA: a.id, companyB: b.id };
  }

  it('User.email é único por company mas duplicável entre companies', async () => {
    const prisma = getPrisma();
    const { companyA, companyB } = await setupTwoCompanies();

    await prisma.user.create({
      data: {
        companyId: companyA,
        name: 'A1',
        email: 'agent@x.com',
        passwordHash: 'h',
        role: 'AGENT',
      },
    });

    // Mesmo email em outra company → ok
    await expect(
      prisma.user.create({
        data: {
          companyId: companyB,
          name: 'B1',
          email: 'agent@x.com',
          passwordHash: 'h',
          role: 'AGENT',
        },
      }),
    ).resolves.toBeDefined();

    // Mesmo email na mesma company → falha
    await expect(
      prisma.user.create({
        data: {
          companyId: companyA,
          name: 'A2',
          email: 'agent@x.com',
          passwordHash: 'h',
          role: 'AGENT',
        },
      }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });

  it('Tag.name é único por company', async () => {
    const prisma = getPrisma();
    const { companyA, companyB } = await setupTwoCompanies();

    await prisma.tag.create({
      data: { companyId: companyA, name: 'urgente', color: '#FF0000' },
    });

    // Outra company → ok
    await expect(
      prisma.tag.create({
        data: { companyId: companyB, name: 'urgente', color: '#FF0000' },
      }),
    ).resolves.toBeDefined();

    // Mesma company → falha
    await expect(
      prisma.tag.create({
        data: { companyId: companyA, name: 'urgente', color: '#00FF00' },
      }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });

  it('Department.name é único por company', async () => {
    const prisma = getPrisma();
    const { companyA, companyB } = await setupTwoCompanies();

    await prisma.department.create({ data: { companyId: companyA, name: 'Suporte' } });

    await expect(
      prisma.department.create({ data: { companyId: companyB, name: 'Suporte' } }),
    ).resolves.toBeDefined();

    await expect(
      prisma.department.create({ data: { companyId: companyA, name: 'Suporte' } }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });

  it('BotCredential.name é único por company', async () => {
    const prisma = getPrisma();
    const { companyA, companyB } = await setupTwoCompanies();

    await prisma.botCredential.create({
      data: {
        companyId: companyA,
        name: 'API X',
        authType: 'NONE',
        config: Buffer.from(''),
      },
    });

    await expect(
      prisma.botCredential.create({
        data: {
          companyId: companyB,
          name: 'API X',
          authType: 'NONE',
          config: Buffer.from(''),
        },
      }),
    ).resolves.toBeDefined();

    await expect(
      prisma.botCredential.create({
        data: {
          companyId: companyA,
          name: 'API X',
          authType: 'NONE',
          config: Buffer.from(''),
        },
      }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });

  it('Company.slug é globalmente único (sem companyId scope)', async () => {
    const prisma = getPrisma();
    const plan = await prisma.plan.create({ data: { name: 'P' } });
    await prisma.company.create({ data: { planId: plan.id, name: 'A', slug: 'shared' } });

    await expect(
      prisma.company.create({ data: { planId: plan.id, name: 'B', slug: 'shared' } }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });
});
