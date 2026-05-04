import * as bcrypt from 'bcrypt';
import type {
  Company,
  Department,
  DepartmentDistributionMode,
  Plan,
  Prisma,
  PrismaClient,
  User,
  UserRole,
} from '@prisma/client';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

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

export async function createDepartment(
  prisma: PrismaClient,
  companyId: string,
  overrides: Partial<{
    name: string;
    active: boolean;
    distributionMode: DepartmentDistributionMode;
    workingHours: Prisma.InputJsonValue;
    slaResponseMinutes: number;
    slaResolutionMinutes: number;
    greetingMessage: string;
    outOfHoursMessage: string;
  }> = {},
): Promise<Department> {
  const data: Prisma.DepartmentUncheckedCreateInput = {
    companyId,
    name: overrides.name ?? `Dept ${nextId()}`,
    active: overrides.active ?? true,
  };
  if (overrides.distributionMode !== undefined) data.distributionMode = overrides.distributionMode;
  if (overrides.workingHours !== undefined) data.workingHours = overrides.workingHours;
  if (overrides.slaResponseMinutes !== undefined)
    data.slaResponseMinutes = overrides.slaResponseMinutes;
  if (overrides.slaResolutionMinutes !== undefined)
    data.slaResolutionMinutes = overrides.slaResolutionMinutes;
  if (overrides.greetingMessage !== undefined) data.greetingMessage = overrides.greetingMessage;
  if (overrides.outOfHoursMessage !== undefined)
    data.outOfHoursMessage = overrides.outOfHoursMessage;

  return prisma.department.create({ data });
}

export async function loginAs(
  app: NestFastifyApplication,
  email: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password },
  });
  if (res.statusCode !== 200) {
    throw new Error(`loginAs failed: ${res.statusCode} ${res.body}`);
  }
  const body = res.json<{ accessToken: string; refreshToken: string }>();
  return { accessToken: body.accessToken, refreshToken: body.refreshToken };
}

export async function createSuperAdmin(
  prisma: PrismaClient,
  companyId: string,
  options: { email?: string; password?: string; name?: string } = {},
): Promise<{ user: User; password: string }> {
  return createUser(prisma, companyId, {
    role: 'SUPER_ADMIN',
    email: options.email ?? `super-${nextId()}@test.local`,
    password: options.password ?? 'valid-password-1234',
    name: options.name ?? `SuperAdmin ${nextId()}`,
  });
}

export async function truncateAll(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "AuditLog", "WebhookDelivery", "WebhookSubscription", "BotCredential", "MessageTemplate", "IntegrationLink", "BusinessHoliday", "CustomFieldDefinition", "ContactTag", "TicketTag", "Contact", "Ticket", "ChatFlow", "ChannelConnection", "LeadStatus", "SalesFunnel", "CloseReasonDepartment", "CloseReason", "QuickReply", "Tag", "UserDepartment", "Department", "RefreshToken", "User", "CompanySettings", "Company", "Plan" RESTART IDENTITY CASCADE`,
  );
}
