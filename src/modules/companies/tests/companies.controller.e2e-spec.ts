import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootstrapTestApp } from '../../../../test/e2e/setup-app';
import { getPrisma } from '../../../../test/setup-prisma';
import {
  createCompany,
  createPlan,
  createSuperAdmin,
  loginAs,
  truncateAll,
} from '../../../../test/e2e/factories';

interface CompanyDto {
  id: string;
  planId: string;
  name: string;
  slug: string;
  active: boolean;
  timezone: string;
  defaultWorkingHours: unknown;
  outOfHoursMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CompanyWithAdminDto {
  company: CompanyDto;
  admin: { id: string; email: string; role: string; companyId: string };
}

async function setupSuperAdmin(app: NestFastifyApplication) {
  const company = await createCompany(getPrisma());
  const { user: super_, password } = await createSuperAdmin(getPrisma(), company.id, {
    email: `super-${Date.now()}@x.com`,
  });
  const tokens = await loginAs(app, super_.email, password);
  return { hostCompany: company, super_, tokens };
}

describe('CompaniesController POST /companies (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await bootstrapTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(getPrisma());
  });

  it('SUPER_ADMIN creates a new tenant with first ADMIN and settings (happy path)', async () => {
    const { tokens } = await setupSuperAdmin(app);
    const plan = await createPlan(getPrisma(), 'Default');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/companies',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        company: {
          name: 'Acme Inc',
          slug: 'acme',
          planId: plan.id,
          timezone: 'America/Sao_Paulo',
        },
        admin: {
          name: 'Beth',
          email: 'beth@acme.com',
          password: 'valid-pass-1234',
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<CompanyWithAdminDto>();
    expect(body.company.slug).toBe('acme');
    expect(body.company.active).toBe(true);
    expect(body.admin.email).toBe('beth@acme.com');
    expect(body.admin.role).toBe('ADMIN');

    const inDb = await getPrisma().company.findFirst({ where: { slug: 'acme' } });
    expect(inDb).not.toBeNull();
    const settings = await getPrisma().companySettings.findUnique({
      where: { companyId: inDb!.id },
    });
    expect(settings).not.toBeNull();
    const admin = await getPrisma().user.findFirst({
      where: { companyId: inDb!.id, role: 'ADMIN' },
    });
    expect(admin?.email).toBe('beth@acme.com');

    const adminRecord = body.admin as Record<string, unknown>;
    expect(adminRecord['passwordHash']).toBeUndefined();
  });
});
