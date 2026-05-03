import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootstrapTestApp } from '../../../../test/e2e/setup-app';
import { getPrisma } from '../../../../test/setup-prisma';
import { createCompany, createUser, loginAs, truncateAll } from '../../../../test/e2e/factories';

interface CompanyDto {
  id: string;
  slug: string;
  name: string;
}

interface ErrorBody {
  message: string;
  errors?: Array<{ field: string; message: string; code: string }>;
}

describe('CompaniesMeController GET /companies/me (e2e)', () => {
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

  it('returns the JWT-bound tenant for any authenticated role', async () => {
    const company = await createCompany(getPrisma(), { slug: 'home-co' });
    const { user, password } = await createUser(getPrisma(), company.id, {
      role: 'AGENT',
      email: 'agent@x.com',
    });
    const tokens = await loginAs(app, user.email, password);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/companies/me',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<CompanyDto>();
    expect(body.id).toBe(company.id);
    expect(body.slug).toBe('home-co');
  });

  it('returns 401 without JWT', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/companies/me',
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('CompaniesMeController PATCH /companies/me (e2e)', () => {
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

  it('ADMIN updates name and timezone of own tenant', async () => {
    const company = await createCompany(getPrisma(), { name: 'Old', slug: 'edit-co' });
    const { user, password } = await createUser(getPrisma(), company.id, {
      role: 'ADMIN',
      email: 'a@edit.com',
    });
    const tokens = await loginAs(app, user.email, password);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/companies/me',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { name: 'New', timezone: 'America/Recife' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<CompanyDto>().name).toBe('New');

    const db = await getPrisma().company.findUnique({ where: { id: company.id } });
    expect(db?.name).toBe('New');
    expect(db?.timezone).toBe('America/Recife');
  });

  it('returns 400 when ADMIN tries to set planId via /me (strict)', async () => {
    const company = await createCompany(getPrisma());
    const { user, password } = await createUser(getPrisma(), company.id, {
      role: 'ADMIN',
      email: 'a@b.com',
    });
    const tokens = await loginAs(app, user.email, password);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/companies/me',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { planId: 'some-uuid', name: 'Hijack' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json<ErrorBody>();
    expect(body.errors?.map((e) => e.code)).toContain('unrecognized_keys');

    const db = await getPrisma().company.findUnique({ where: { id: company.id } });
    expect(db?.name).not.toBe('Hijack');
  });

  it('returns 400 when ADMIN sends slug or active', async () => {
    const company = await createCompany(getPrisma());
    const { user, password } = await createUser(getPrisma(), company.id, {
      role: 'ADMIN',
      email: 'a@c.com',
    });
    const tokens = await loginAs(app, user.email, password);

    const res1 = await app.inject({
      method: 'PATCH',
      url: '/api/v1/companies/me',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { slug: 'new-slug' },
    });
    expect(res1.statusCode).toBe(400);

    const res2 = await app.inject({
      method: 'PATCH',
      url: '/api/v1/companies/me',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { active: false },
    });
    expect(res2.statusCode).toBe(400);
  });

  it('returns 403 when AGENT or SUPERVISOR tries to PATCH /me', async () => {
    const company = await createCompany(getPrisma());
    const { user: agent, password } = await createUser(getPrisma(), company.id, {
      role: 'AGENT',
    });
    const tokens = await loginAs(app, agent.email, password);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/companies/me',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('clears outOfHoursMessage when null is sent', async () => {
    const company = await createCompany(getPrisma());
    await getPrisma().company.update({
      where: { id: company.id },
      data: { outOfHoursMessage: 'Old message' },
    });
    const { user, password } = await createUser(getPrisma(), company.id, {
      role: 'ADMIN',
      email: 'a@n.com',
    });
    const tokens = await loginAs(app, user.email, password);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/companies/me',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { outOfHoursMessage: null },
    });

    expect(res.statusCode).toBe(200);
    const db = await getPrisma().company.findUnique({ where: { id: company.id } });
    expect(db?.outOfHoursMessage).toBeNull();
  });
});
