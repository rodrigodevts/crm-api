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

interface ErrorBody {
  message: string;
  errors?: Array<{ field: string; message: string; code: string }>;
}

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

describe('CompaniesController PATCH /companies/:id (e2e)', () => {
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

  it('SUPER_ADMIN updates name, planId and active', async () => {
    const { tokens } = await setupSuperAdmin(app);
    const newPlan = await createPlan(getPrisma(), 'Pro');
    const target = await createCompany(getPrisma(), { slug: 'tg-co' });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/companies/${target.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { name: 'Renamed', planId: newPlan.id, active: false },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<CompanyDto>();
    expect(body.name).toBe('Renamed');
    expect(body.active).toBe(false);
    expect(body.planId).toBe(newPlan.id);
  });

  it('returns 422 when planId points to inactive plan', async () => {
    const { tokens } = await setupSuperAdmin(app);
    const inactivePlan = await getPrisma().plan.create({
      data: { name: 'Old', active: false },
    });
    const target = await createCompany(getPrisma(), { slug: 'inactive-plan-co' });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/companies/${target.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { planId: inactivePlan.id },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json<ErrorBody>().message).toBe('Plano não encontrado ou inativo');
  });

  it('returns 400 when SUPER_ADMIN tries to send slug', async () => {
    const { tokens } = await setupSuperAdmin(app);
    const target = await createCompany(getPrisma(), { slug: 'orig' });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/companies/${target.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { slug: 'new-slug' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorBody>().errors?.map((e) => e.code)).toContain('unrecognized_keys');

    const db = await getPrisma().company.findUnique({ where: { id: target.id } });
    expect(db?.slug).toBe('orig');
  });

  it('returns 403 when ADMIN tries PATCH /companies/:id', async () => {
    const company = await createCompany(getPrisma());
    const { user, password } = await createUser(getPrisma(), company.id, {
      role: 'ADMIN',
      email: 'a@d.com',
    });
    const tokens = await loginAs(app, user.email, password);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/companies/${company.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when target is soft-deleted', async () => {
    const { tokens } = await setupSuperAdmin(app);
    const target = await createCompany(getPrisma(), { slug: 'sd-co' });
    await getPrisma().company.update({
      where: { id: target.id },
      data: { deletedAt: new Date() },
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/companies/${target.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { name: 'Updated Name' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('CompaniesController DELETE /companies/:id (e2e)', () => {
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

  it('returns 409 when target tenant has active users', async () => {
    const { tokens } = await setupSuperAdmin(app);
    const target = await createCompany(getPrisma(), { slug: 'busy-co' });
    await createUser(getPrisma(), target.id, { role: 'ADMIN', email: 'busy-admin@x.com' });

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/companies/${target.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorBody>().message).toBe(
      'Não é possível excluir empresa com usuários ativos. Remova-os primeiro.',
    );
  });

  it('soft-deletes empty tenant and subsequent GET returns 404', async () => {
    const { tokens } = await setupSuperAdmin(app);
    const target = await createCompany(getPrisma(), { slug: 'empty-co' });

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/companies/${target.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(del.statusCode).toBe(204);

    const inDb = await getPrisma().company.findUnique({ where: { id: target.id } });
    expect(inDb?.deletedAt).not.toBeNull();

    const get = await app.inject({
      method: 'GET',
      url: `/api/v1/companies/${target.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(get.statusCode).toBe(404);
  });

  it('returns 403 when ADMIN tries DELETE', async () => {
    const company = await createCompany(getPrisma());
    const { user, password } = await createUser(getPrisma(), company.id, {
      role: 'ADMIN',
      email: 'a@d2.com',
    });
    const tokens = await loginAs(app, user.email, password);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/companies/${company.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('soft-delete keeps slug occupied (POST with same slug returns 409 after DELETE)', async () => {
    const { tokens } = await setupSuperAdmin(app);
    const plan = await createPlan(getPrisma(), 'Default');

    const create1 = await app.inject({
      method: 'POST',
      url: '/api/v1/companies',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        company: { name: 'Reused Co', slug: 'reused', planId: plan.id },
        admin: { name: 'Admin A', email: 'reused-a@x.com', password: 'valid-1234' },
      },
    });
    expect(create1.statusCode).toBe(201);
    const id = create1.json<CompanyWithAdminDto>().company.id;
    const adminId = create1.json<CompanyWithAdminDto>().admin.id;

    await getPrisma().user.update({
      where: { id: adminId },
      data: { deletedAt: new Date() },
    });

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/companies/${id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(del.statusCode).toBe(204);

    const create2 = await app.inject({
      method: 'POST',
      url: '/api/v1/companies',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        company: { name: 'Reused Co 2', slug: 'reused', planId: plan.id },
        admin: { name: 'Admin B', email: 'reused-b@x.com', password: 'valid-1234' },
      },
    });
    expect(create2.statusCode).toBe(409);
    expect(create2.json<ErrorBody>().message).toBe('Slug já em uso');
  });
});

describe('CompaniesController multi-tenant isolation (Companies as tenant root)', () => {
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

  it('ADMIN of A reading /:idDeB returns 404, not 403 (no existence leak)', async () => {
    const a = await createCompany(getPrisma(), { slug: 'mt-a' });
    const b = await createCompany(getPrisma(), { slug: 'mt-b' });
    const { user, password } = await createUser(getPrisma(), a.id, {
      role: 'ADMIN',
      email: 'a@mt.com',
    });
    const tokens = await loginAs(app, user.email, password);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/companies/${b.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('ADMIN of A cannot list (403, RolesGuard barra)', async () => {
    const a = await createCompany(getPrisma(), { slug: 'mt-a2' });
    const { user, password } = await createUser(getPrisma(), a.id, {
      role: 'ADMIN',
      email: 'a@mt2.com',
    });
    const tokens = await loginAs(app, user.email, password);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/companies',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('GET /companies/me returns A, not B', async () => {
    const a = await createCompany(getPrisma(), { slug: 'me-a' });
    const b = await createCompany(getPrisma(), { slug: 'me-b' });
    void b;
    const { user, password } = await createUser(getPrisma(), a.id, {
      role: 'AGENT',
      email: 'a-agent@me.com',
    });
    const tokens = await loginAs(app, user.email, password);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/companies/me',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<CompanyDto>().slug).toBe('me-a');
  });
});

describe('CompaniesController POST /companies sad paths (e2e)', () => {
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

  it('returns 400 with invalid slug formats', async () => {
    const { tokens } = await setupSuperAdmin(app);
    const plan = await createPlan(getPrisma(), 'Default');

    const cases = ['Acme Co', 'acme-', '--acme--', 'a'];
    for (const slug of cases) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/companies',
        headers: { authorization: `Bearer ${tokens.accessToken}` },
        payload: {
          company: { name: 'Test Co', slug, planId: plan.id },
          admin: { name: 'Admin', email: `a-${Date.now()}@x.com`, password: 'valid-1234' },
        },
      });
      expect(res.statusCode).toBe(400);
    }
  });

  it('returns 409 on duplicated slug', async () => {
    const { tokens } = await setupSuperAdmin(app);
    const plan = await createPlan(getPrisma(), 'Default');
    await createCompany(getPrisma(), { slug: 'taken' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/companies',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        company: { name: 'Test Co', slug: 'taken', planId: plan.id },
        admin: { name: 'Admin', email: 'taken-a@x.com', password: 'valid-1234' },
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorBody>().message).toBe('Slug já em uso');
  });

  it('returns 409 on duplicated admin email (global unique)', async () => {
    const { tokens, super_ } = await setupSuperAdmin(app);
    const plan = await createPlan(getPrisma(), 'Default');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/companies',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        company: { name: 'Test Co', slug: 'dup-email', planId: plan.id },
        admin: { name: 'Admin', email: super_.email, password: 'valid-1234' },
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorBody>().message).toBe('Email já cadastrado');
  });

  it('returns 422 on inactive planId', async () => {
    const { tokens } = await setupSuperAdmin(app);
    const inactive = await getPrisma().plan.create({
      data: { name: 'Old', active: false },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/companies',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        company: { name: 'Test Co', slug: 'inactive-co', planId: inactive.id },
        admin: { name: 'Admin', email: 'inactive-a@x.com', password: 'valid-1234' },
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json<ErrorBody>().message).toBe('Plano não encontrado ou inativo');
  });

  it('returns 422 on non-existent planId', async () => {
    const { tokens } = await setupSuperAdmin(app);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/companies',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        company: {
          name: 'Test Co',
          slug: 'no-plan',
          planId: '00000000-0000-0000-0000-000000000000',
        },
        admin: { name: 'Admin', email: 'no-plan-a@x.com', password: 'valid-1234' },
      },
    });
    expect(res.statusCode).toBe(422);
  });

  it('returns 403 when ADMIN tries POST', async () => {
    const company = await createCompany(getPrisma());
    const { user, password } = await createUser(getPrisma(), company.id, {
      role: 'ADMIN',
      email: 'a@p.com',
    });
    const tokens = await loginAs(app, user.email, password);
    const plan = await createPlan(getPrisma(), 'Default');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/companies',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        company: { name: 'Test Co', slug: 'forbid', planId: plan.id },
        admin: { name: 'Admin', email: 'fa@x.com', password: 'valid-1234' },
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 when body missing admin section', async () => {
    const { tokens } = await setupSuperAdmin(app);
    const plan = await createPlan(getPrisma(), 'Default');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/companies',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        company: { name: 'Test Co', slug: 'no-admin', planId: plan.id },
      },
    });
    expect(res.statusCode).toBe(400);
  });
});
