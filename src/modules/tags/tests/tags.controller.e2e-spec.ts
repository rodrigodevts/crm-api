import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Company, User } from '@prisma/client';
import { bootstrapTestApp } from '../../../../test/e2e/setup-app';
import {
  createCompany,
  createTag,
  createUser,
  loginAs,
  truncateAll,
} from '../../../../test/e2e/factories';
import { getPrisma } from '../../../../test/setup-prisma';

interface TagDto {
  id: string;
  companyId: string;
  name: string;
  color: string;
  scope: 'CONTACT' | 'TICKET' | 'BOTH';
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TagListResponse {
  items: TagDto[];
  pagination: { nextCursor: string | null; hasMore: boolean };
}

interface ErrorBody {
  message: string;
  errors?: Array<{ field: string; message: string; code: string }>;
}

describe('TagsController (e2e) — happy paths', () => {
  let app: NestFastifyApplication;
  let company: Company;
  let admin: { user: User; password: string };
  let supervisor: { user: User; password: string };
  let agent: { user: User; password: string };
  let tokenAdmin: string;
  let tokenSupervisor: string;
  let tokenAgent: string;

  beforeAll(async () => {
    app = await bootstrapTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(getPrisma());
    company = await createCompany(getPrisma());
    admin = await createUser(getPrisma(), company.id, { role: 'ADMIN' });
    supervisor = await createUser(getPrisma(), company.id, { role: 'SUPERVISOR' });
    agent = await createUser(getPrisma(), company.id, { role: 'AGENT' });
    ({ accessToken: tokenAdmin } = await loginAs(app, admin.user.email, admin.password));
    ({ accessToken: tokenSupervisor } = await loginAs(
      app,
      supervisor.user.email,
      supervisor.password,
    ));
    ({ accessToken: tokenAgent } = await loginAs(app, agent.user.email, agent.password));
  });

  it('POST /tags como ADMIN cria com defaults (scope=BOTH, active=true)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tags',
      headers: { authorization: `Bearer ${tokenAdmin}` },
      payload: { name: 'VIP', color: '#aabbcc' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<TagDto>();
    expect(body.name).toBe('VIP');
    expect(body.scope).toBe('BOTH');
    expect(body.active).toBe(true);
    expect(body.color).toBe('#AABBCC'); // normalizado para uppercase
  });

  it('POST /tags como SUPERVISOR também funciona (D-2.2)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tags',
      headers: { authorization: `Bearer ${tokenSupervisor}` },
      payload: { name: 'Sup', color: '#000000', scope: 'TICKET' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('GET /tags como AGENT retorna lista (qualquer auth)', async () => {
    await createTag(getPrisma(), company.id, { name: 'A' });
    await createTag(getPrisma(), company.id, { name: 'B' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/tags',
      headers: { authorization: `Bearer ${tokenAgent}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<TagListResponse>();
    expect(body.items).toHaveLength(2);
  });

  it('GET /tags/:id retorna detalhe', async () => {
    const tag = await createTag(getPrisma(), company.id, { name: 'Detail' });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/tags/${tag.id}`,
      headers: { authorization: `Bearer ${tokenAgent}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<TagDto>().name).toBe('Detail');
  });

  it('PATCH /tags/:id como SUPERVISOR atualiza name', async () => {
    const tag = await createTag(getPrisma(), company.id, { name: 'Old' });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tags/${tag.id}`,
      headers: { authorization: `Bearer ${tokenSupervisor}` },
      payload: { name: 'New' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<TagDto>().name).toBe('New');
  });

  it('DELETE /tags/:id (soft) como SUPERVISOR marca active=false', async () => {
    const tag = await createTag(getPrisma(), company.id, { active: true });
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/tags/${tag.id}`,
      headers: { authorization: `Bearer ${tokenSupervisor}` },
    });
    expect(del.statusCode).toBe(204);
    const get = await app.inject({
      method: 'GET',
      url: `/api/v1/tags/${tag.id}`,
      headers: { authorization: `Bearer ${tokenAgent}` },
    });
    expect(get.statusCode).toBe(200);
    expect(get.json<TagDto>().active).toBe(false);
  });

  it('DELETE /tags/:id?hard=true como ADMIN sem assignments retorna 204', async () => {
    const tag = await createTag(getPrisma(), company.id);
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/tags/${tag.id}?hard=true`,
      headers: { authorization: `Bearer ${tokenAdmin}` },
    });
    expect(del.statusCode).toBe(204);
    const get = await app.inject({
      method: 'GET',
      url: `/api/v1/tags/${tag.id}`,
      headers: { authorization: `Bearer ${tokenAgent}` },
    });
    expect(get.statusCode).toBe(404);
  });
});

describe('TagsController (e2e) — sad paths', () => {
  let app: NestFastifyApplication;
  let company: Company;
  let admin: { user: User; password: string };
  let supervisor: { user: User; password: string };
  let agent: { user: User; password: string };
  let tokenAdmin: string;
  let tokenSupervisor: string;
  let tokenAgent: string;

  beforeAll(async () => {
    app = await bootstrapTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(getPrisma());
    company = await createCompany(getPrisma());
    admin = await createUser(getPrisma(), company.id, { role: 'ADMIN' });
    supervisor = await createUser(getPrisma(), company.id, { role: 'SUPERVISOR' });
    agent = await createUser(getPrisma(), company.id, { role: 'AGENT' });
    ({ accessToken: tokenAdmin } = await loginAs(app, admin.user.email, admin.password));
    ({ accessToken: tokenSupervisor } = await loginAs(
      app,
      supervisor.user.email,
      supervisor.password,
    ));
    ({ accessToken: tokenAgent } = await loginAs(app, agent.user.email, agent.password));
  });

  it('POST color inválido ("red") retorna 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tags',
      headers: { authorization: `Bearer ${tokenAdmin}` },
      payload: { name: 'X', color: 'red' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST color inválido (#abc) retorna 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tags',
      headers: { authorization: `Bearer ${tokenAdmin}` },
      payload: { name: 'X', color: '#abc' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST name vazio retorna 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tags',
      headers: { authorization: `Bearer ${tokenAdmin}` },
      payload: { name: '', color: '#000000' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST com campo desconhecido retorna 400 (.strict())', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tags',
      headers: { authorization: `Bearer ${tokenAdmin}` },
      payload: { name: 'X', color: '#000000', foo: 'bar' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST nome duplicado no mesmo tenant retorna 409', async () => {
    await createTag(getPrisma(), company.id, { name: 'Dup' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tags',
      headers: { authorization: `Bearer ${tokenAdmin}` },
      payload: { name: 'Dup', color: '#FFFFFF' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('PATCH rename para nome existente retorna 409', async () => {
    await createTag(getPrisma(), company.id, { name: 'Existing' });
    const target = await createTag(getPrisma(), company.id, { name: 'Target' });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tags/${target.id}`,
      headers: { authorization: `Bearer ${tokenSupervisor}` },
      payload: { name: 'Existing' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('PATCH com campo desconhecido retorna 400', async () => {
    const tag = await createTag(getPrisma(), company.id);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tags/${tag.id}`,
      headers: { authorization: `Bearer ${tokenSupervisor}` },
      payload: { foo: 'bar' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /tags/:id inexistente retorna 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/tags/00000000-0000-0000-0000-000000000000',
      headers: { authorization: `Bearer ${tokenAgent}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE ?hard=true como SUPERVISOR retorna 403', async () => {
    const tag = await createTag(getPrisma(), company.id);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/tags/${tag.id}?hard=true`,
      headers: { authorization: `Bearer ${tokenSupervisor}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('DELETE ?hard=true como AGENT retorna 403 (RolesGuard)', async () => {
    const tag = await createTag(getPrisma(), company.id);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/tags/${tag.id}?hard=true`,
      headers: { authorization: `Bearer ${tokenAgent}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('DELETE soft como AGENT retorna 403', async () => {
    const tag = await createTag(getPrisma(), company.id);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/tags/${tag.id}`,
      headers: { authorization: `Bearer ${tokenAgent}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST como AGENT retorna 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tags',
      headers: { authorization: `Bearer ${tokenAgent}` },
      payload: { name: 'X', color: '#000000' },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('TagsController (e2e) — multi-tenant guard', () => {
  let app: NestFastifyApplication;
  let companyA: Company;
  let companyB: Company;
  let adminA: { user: User; password: string };
  let supervisorB: { user: User; password: string };
  let tokenAdminA: string;
  let tokenSupervisorB: string;

  beforeAll(async () => {
    app = await bootstrapTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(getPrisma());
    companyA = await createCompany(getPrisma());
    companyB = await createCompany(getPrisma());
    adminA = await createUser(getPrisma(), companyA.id, { role: 'ADMIN' });
    supervisorB = await createUser(getPrisma(), companyB.id, { role: 'SUPERVISOR' });
    ({ accessToken: tokenAdminA } = await loginAs(app, adminA.user.email, adminA.password));
    ({ accessToken: tokenSupervisorB } = await loginAs(
      app,
      supervisorB.user.email,
      supervisorB.password,
    ));
  });

  it('tenants A e B podem criar tag com mesmo nome (unique é por tenant)', async () => {
    const resA = await app.inject({
      method: 'POST',
      url: '/api/v1/tags',
      headers: { authorization: `Bearer ${tokenAdminA}` },
      payload: { name: 'VIP', color: '#FF0000' },
    });
    expect(resA.statusCode).toBe(201);
    const resB = await app.inject({
      method: 'POST',
      url: '/api/v1/tags',
      headers: { authorization: `Bearer ${tokenSupervisorB}` },
      payload: { name: 'VIP', color: '#00FF00' },
    });
    expect(resB.statusCode).toBe(201);
  });

  it('tenant B GET tag de A retorna 404', async () => {
    const tagA = await createTag(getPrisma(), companyA.id);
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/tags/${tagA.id}`,
      headers: { authorization: `Bearer ${tokenSupervisorB}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('tenant B PATCH tag de A retorna 404', async () => {
    const tagA = await createTag(getPrisma(), companyA.id);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tags/${tagA.id}`,
      headers: { authorization: `Bearer ${tokenSupervisorB}` },
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('tenant B DELETE tag de A retorna 404', async () => {
    const tagA = await createTag(getPrisma(), companyA.id);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/tags/${tagA.id}`,
      headers: { authorization: `Bearer ${tokenSupervisorB}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /tags lista apenas tags do próprio tenant', async () => {
    await createTag(getPrisma(), companyA.id, { name: 'TagA' });
    await createTag(getPrisma(), companyB.id, { name: 'TagB' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/tags',
      headers: { authorization: `Bearer ${tokenAdminA}` },
    });
    expect(res.statusCode).toBe(200);
    const items = res.json<TagListResponse>().items;
    expect(items).toHaveLength(1);
    expect(items[0]!.name).toBe('TagA');
  });
});

describe('TagsController (e2e) — scope filter semantics', () => {
  let app: NestFastifyApplication;
  let company: Company;
  let agent: { user: User; password: string };
  let token: string;

  beforeAll(async () => {
    app = await bootstrapTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(getPrisma());
    company = await createCompany(getPrisma());
    agent = await createUser(getPrisma(), company.id, { role: 'AGENT' });
    ({ accessToken: token } = await loginAs(app, agent.user.email, agent.password));
    await createTag(getPrisma(), company.id, { name: 'OnlyTicket', scope: 'TICKET' });
    await createTag(getPrisma(), company.id, { name: 'OnlyContact', scope: 'CONTACT' });
    await createTag(getPrisma(), company.id, { name: 'Both', scope: 'BOTH' });
  });

  it('?scope=TICKET inclui TICKET + BOTH', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/tags?scope=TICKET',
      headers: { authorization: `Bearer ${token}` },
    });
    const names = res
      .json<TagListResponse>()
      .items.map((t) => t.name)
      .sort();
    expect(names).toEqual(['Both', 'OnlyTicket']);
  });

  it('?scope=CONTACT inclui CONTACT + BOTH', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/tags?scope=CONTACT',
      headers: { authorization: `Bearer ${token}` },
    });
    const names = res
      .json<TagListResponse>()
      .items.map((t) => t.name)
      .sort();
    expect(names).toEqual(['Both', 'OnlyContact']);
  });

  it('?scope=BOTH retorna apenas BOTH (literal)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/tags?scope=BOTH',
      headers: { authorization: `Bearer ${token}` },
    });
    const items = res.json<TagListResponse>().items;
    expect(items).toHaveLength(1);
    expect(items[0]!.name).toBe('Both');
  });

  it('sem ?scope retorna todas as 3', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/tags',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.json<TagListResponse>().items).toHaveLength(3);
  });
});

describe('TagsController (e2e) — hard delete blocked by assignments', () => {
  let app: NestFastifyApplication;
  let company: Company;
  let admin: { user: User; password: string };
  let token: string;

  beforeAll(async () => {
    app = await bootstrapTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(getPrisma());
    company = await createCompany(getPrisma());
    admin = await createUser(getPrisma(), company.id, { role: 'ADMIN' });
    ({ accessToken: token } = await loginAs(app, admin.user.email, admin.password));
  });

  it('DELETE ?hard=true bloqueado se há ContactTag (409 com contagem)', async () => {
    const tag = await createTag(getPrisma(), company.id, { name: 'Vinculada' });

    const contact = await getPrisma().contact.create({
      data: {
        companyId: company.id,
        phoneNumber: '+5511999990001',
      },
    });
    await getPrisma().contactTag.create({
      data: { contactId: contact.id, tagId: tag.id },
    });

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/tags/${tag.id}?hard=true`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorBody>().message).toMatch(/atribuição/i);
    expect(res.json<ErrorBody>().message).toMatch(/1/);
  });
});
