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
