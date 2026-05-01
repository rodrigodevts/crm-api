import * as bcrypt from 'bcrypt';
import type { Company, Plan, PrismaClient, User, UserRole } from '@prisma/client';

let counter = 0;
const nextId = (): string => `${Date.now()}-${++counter}`;

export async function createPlan(prisma: PrismaClient, name?: string): Promise<Plan> {
  return prisma.plan.upsert({
    where: { name: name ?? 'Default' },
    update: {},
    create: { name: name ?? 'Default', description: 'Test plan' },
  });
}

export async function createCompany(
  prisma: PrismaClient,
  overrides: Partial<{ slug: string; name: string }> = {},
): Promise<Company> {
  const plan = await createPlan(prisma);
  const slug = overrides.slug ?? `co-${nextId()}`;
  return prisma.company.create({
    data: {
      planId: plan.id,
      name: overrides.name ?? `Company ${slug}`,
      slug,
    },
  });
}

export async function createUser(
  prisma: PrismaClient,
  companyId: string,
  options: { role?: UserRole; email?: string; password?: string; name?: string } = {},
): Promise<{ user: User; password: string }> {
  const password = options.password ?? 'valid-password-1234';
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      companyId,
      name: options.name ?? `User ${nextId()}`,
      email: options.email ?? `user-${nextId()}@test.local`,
      passwordHash,
      role: options.role ?? 'AGENT',
    },
  });
  return { user, password };
}

export async function truncateAll(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "AuditLog", "WebhookDelivery", "WebhookSubscription", "BotCredential", "MessageTemplate", "IntegrationLink", "BusinessHoliday", "CustomFieldDefinition", "ContactTag", "TicketTag", "Contact", "Ticket", "ChatFlow", "ChannelConnection", "LeadStatus", "SalesFunnel", "CloseReasonDepartment", "CloseReason", "QuickReply", "Tag", "UserDepartment", "Department", "RefreshToken", "User", "CompanySettings", "Company", "Plan" RESTART IDENTITY CASCADE`,
  );
}
