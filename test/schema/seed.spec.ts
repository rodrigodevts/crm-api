import { describe, it, expect, beforeEach } from 'vitest';
import { execSync } from 'node:child_process';
import { getPrisma } from '../setup-prisma';

describe('seed', () => {
  beforeEach(async () => {
    const prisma = getPrisma();
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "AuditLog", "WebhookDelivery", "WebhookSubscription", "BotCredential", "MessageTemplate", "IntegrationLink", "BusinessHoliday", "CustomFieldDefinition", "ContactTag", "TicketTag", "Contact", "Ticket", "ChatFlow", "ChannelConnection", "LeadStatus", "SalesFunnel", "CloseReasonDepartment", "CloseReason", "QuickReply", "Tag", "UserDepartment", "Department", "RefreshToken", "User", "CompanySettings", "Company", "Plan" RESTART IDENTITY CASCADE`,
    );
  });

  function runSeed(): void {
    execSync('pnpm tsx prisma/seed.ts', {
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL!,
        SEED_SUPER_ADMIN_EMAIL: 'test-super@digichat.local',
        SEED_SUPER_ADMIN_PASSWORD: 'test-password',
      },
      stdio: 'pipe',
    });
  }

  it('seed cria 1 Plan, 1 Company, 1 CompanySettings, 1 SUPER_ADMIN em base limpa', async () => {
    const prisma = getPrisma();

    runSeed();

    const planCount = await prisma.plan.count();
    const companyCount = await prisma.company.count();
    const settingsCount = await prisma.companySettings.count();
    const userCount = await prisma.user.count();

    expect(planCount).toBe(1);
    expect(companyCount).toBe(1);
    expect(settingsCount).toBe(1);
    expect(userCount).toBe(1);

    const user = await prisma.user.findFirst();
    expect(user?.role).toBe('SUPER_ADMIN');
    expect(user?.email).toBe('test-super@digichat.local');
  });

  it('seed é idempotente: rodar 2x mantém 1 de cada', async () => {
    const prisma = getPrisma();

    runSeed();
    runSeed();

    expect(await prisma.plan.count()).toBe(1);
    expect(await prisma.company.count()).toBe(1);
    expect(await prisma.companySettings.count()).toBe(1);
    expect(await prisma.user.count()).toBe(1);
  });
});
