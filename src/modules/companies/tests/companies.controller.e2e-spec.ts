import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootstrapTestApp } from '../../../../test/e2e/setup-app';
import { getPrisma } from '../../../../test/setup-prisma';
import {
  createCompany,
  createPlan,
  createSuperAdmin,
  createUser,
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

describe('CompaniesController GET /companies (e2e)', () => {
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

  it('SUPER_ADMIN lists all tenants', async () => {
    const { tokens, hostCompany } = await setupSuperAdmin(app);
    const second = await createCompany(getPrisma(), { slug: 'beta-co' });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/companies?limit=20',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: CompanyDto[]; pagination: { hasMore: boolean } }>();
    const slugs = body.items.map((c) => c.slug);
    expect(slugs).toContain(hostCompany.slug);
    expect(slugs).toContain(second.slug);
  });

  it('returns 403 when ADMIN tries to list', async () => {
    const company = await createCompany(getPrisma());
    const { user: admin, password } = await createUser(getPrisma(), company.id, {
      role: 'ADMIN',
      email: 'a@x.com',
    });
    const tokens = await loginAs(app, admin.email, password);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/companies',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });

    expect(res.statusCode).toBe(403);
  });

  it('excludes soft-deleted companies by default (active=true)', async () => {
    const { tokens } = await setupSuperAdmin(app);
    const deleted = await createCompany(getPrisma(), { slug: 'deleted-co' });
    await getPrisma().company.update({
      where: { id: deleted.id },
      data: { deletedAt: new Date() },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/companies',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: CompanyDto[] }>();
    expect(body.items.find((c) => c.slug === 'deleted-co')).toBeUndefined();
  });
});

describe('CompaniesController GET /companies/:id (e2e)', () => {
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

  it('SUPER_ADMIN reads any tenant', async () => {
    const { tokens } = await setupSuperAdmin(app);
    const target = await createCompany(getPrisma(), { slug: 'target-co' });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/companies/${target.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<CompanyDto>().slug).toBe('target-co');
  });

  it('ADMIN reads its own tenant', async () => {
    const company = await createCompany(getPrisma(), { slug: 'self-co' });
    const { user, password } = await createUser(getPrisma(), company.id, {
      role: 'ADMIN',
      email: 'a@self.com',
    });
    const tokens = await loginAs(app, user.email, password);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/companies/${company.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
  });

  it('ADMIN of company A gets 404 (not 403) when reading company B', async () => {
    const a = await createCompany(getPrisma(), { slug: 'aa-co' });
    const b = await createCompany(getPrisma(), { slug: 'bb-co' });
    const { user, password } = await createUser(getPrisma(), a.id, {
      role: 'ADMIN',
      email: 'a@aa.com',
    });
    const tokens = await loginAs(app, user.email, password);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/companies/${b.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it('AGENT gets 403 (RolesGuard barra antes do app service)', async () => {
    const company = await createCompany(getPrisma(), { slug: 'ag-co' });
    const { user, password } = await createUser(getPrisma(), company.id, {
      role: 'AGENT',
    });
    const tokens = await loginAs(app, user.email, password);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/companies/${company.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });

    expect(res.statusCode).toBe(403);
  });

  it('SUPER_ADMIN gets 404 when company is soft-deleted', async () => {
    const { tokens } = await setupSuperAdmin(app);
    const target = await createCompany(getPrisma(), { slug: 'soft-co' });
    await getPrisma().company.update({
      where: { id: target.id },
      data: { deletedAt: new Date() },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/companies/${target.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });

    expect(res.statusCode).toBe(404);
  });
});
