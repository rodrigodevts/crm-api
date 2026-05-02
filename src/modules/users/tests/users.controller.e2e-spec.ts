import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import * as bcrypt from 'bcrypt';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootstrapTestApp } from '../../../../test/e2e/setup-app';
import {
  createCompany,
  createDepartment,
  createUser,
  loginAs,
  truncateAll,
} from '../../../../test/e2e/factories';
import { getPrisma } from '../../../../test/setup-prisma';

interface UserDto {
  id: string;
  companyId: string;
  name: string;
  email: string;
  role: string;
  departments: Array<{ id: string; name: string }>;
  absenceActive: boolean;
  absenceMessage: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface _ListResponse {
  items: UserDto[];
  pagination: { nextCursor: string | null; hasMore: boolean };
}

interface ErrorBody {
  message: string;
  errors?: Array<{ field: string; message: string; code: string }>;
}

async function setupAdmin(app: NestFastifyApplication) {
  const company = await createCompany(getPrisma());
  const { user: admin, password } = await createUser(getPrisma(), company.id, {
    role: 'ADMIN',
    email: `admin-${Date.now()}@x.com`,
  });
  const tokens = await loginAs(app, admin.email, password);
  return { company, admin, tokens };
}

describe('UsersController POST /users (e2e)', () => {
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

  it('creates an AGENT and returns it with departments populated', async () => {
    const { company, tokens } = await setupAdmin(app);
    const dept = await createDepartment(getPrisma(), company.id, { name: 'Suporte' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        name: 'Maria',
        email: 'maria@x.com',
        password: 'valid-pass-1234',
        role: 'AGENT',
        departmentIds: [dept.id],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<UserDto>();
    expect(body.email).toBe('maria@x.com');
    expect(body.role).toBe('AGENT');
    expect(body.departments).toEqual([{ id: dept.id, name: 'Suporte' }]);

    const persisted = await getPrisma().user.findUnique({ where: { id: body.id } });
    expect(persisted?.passwordHash).toBeTruthy();
    expect(persisted?.passwordHash).not.toBe('valid-pass-1234');
    expect(await bcrypt.compare('valid-pass-1234', persisted!.passwordHash)).toBe(true);
  });

  it('returns 400 when role is SUPER_ADMIN (TC-USER-1)', async () => {
    const { tokens } = await setupAdmin(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        name: 'X',
        email: 'x@x.com',
        password: 'valid-pass-1234',
        role: 'SUPER_ADMIN',
        departmentIds: [],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 409 when email already exists in the same tenant (TC-USER-4)', async () => {
    const { company, tokens } = await setupAdmin(app);
    await createUser(getPrisma(), company.id, { email: 'taken@x.com' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        name: 'João',
        email: 'taken@x.com',
        password: 'valid-pass-1234',
        role: 'AGENT',
        departmentIds: [],
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorBody>().message).toBe('Email já cadastrado');
  });

  it('returns 409 when email already exists in another tenant (TC-USER-5)', async () => {
    const { tokens } = await setupAdmin(app);
    const otherCompany = await createCompany(getPrisma());
    await createUser(getPrisma(), otherCompany.id, { email: 'cross@x.com' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        name: 'Pedro',
        email: 'cross@x.com',
        password: 'valid-pass-1234',
        role: 'AGENT',
        departmentIds: [],
      },
    });
    expect(res.statusCode).toBe(409);
  });

  it('returns 400 when departmentIds reference a department in another tenant', async () => {
    const { tokens } = await setupAdmin(app);
    const otherCompany = await createCompany(getPrisma());
    const otherDept = await createDepartment(getPrisma(), otherCompany.id);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        name: 'Ana',
        email: 'ana@x.com',
        password: 'valid-pass-1234',
        role: 'AGENT',
        departmentIds: [otherDept.id],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorBody>().message).toBe('Departamento(s) não encontrado(s) no tenant');
  });

  it('returns 403 when caller is AGENT', async () => {
    const company = await createCompany(getPrisma());
    const { user: agent, password } = await createUser(getPrisma(), company.id, { role: 'AGENT' });
    const tokens = await loginAs(app, agent.email, password);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        name: 'Lucas',
        email: 'lucas@x.com',
        password: 'valid-pass-1234',
        role: 'AGENT',
        departmentIds: [],
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 401 when no JWT is provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: {
        name: 'Y',
        email: 'y@x.com',
        password: 'valid-pass-1234',
        role: 'AGENT',
        departmentIds: [],
      },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('UsersController GET /users (e2e)', () => {
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

  it('lists users of the tenant filtered by role=AGENT', async () => {
    const { company, tokens } = await setupAdmin(app);
    await createUser(getPrisma(), company.id, { role: 'AGENT', email: 'a1@x.com' });
    await createUser(getPrisma(), company.id, { role: 'AGENT', email: 'a2@x.com' });
    await createUser(getPrisma(), company.id, { role: 'SUPERVISOR', email: 's1@x.com' });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users?role=AGENT&active=true',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<_ListResponse>();
    expect(body.items.length).toBe(2);
    body.items.forEach((u) => expect(u.role).toBe('AGENT'));
  });

  it('does not list users from other tenants (multi-tenant isolation)', async () => {
    const { tokens } = await setupAdmin(app);
    const otherCompany = await createCompany(getPrisma());
    await createUser(getPrisma(), otherCompany.id, { email: 'cross@x.com' });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const emails = res.json<_ListResponse>().items.map((u) => u.email);
    expect(emails).not.toContain('cross@x.com');
  });

  it('does not list soft-deleted users by default', async () => {
    const { company, tokens } = await setupAdmin(app);
    const { user } = await createUser(getPrisma(), company.id, { email: 'deleted@x.com' });
    await getPrisma().user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    const emails = res.json<_ListResponse>().items.map((u) => u.email);
    expect(emails).not.toContain('deleted@x.com');
  });

  it('supports cursor pagination (returns nextCursor when hasMore)', async () => {
    const { company, tokens } = await setupAdmin(app);
    for (let i = 0; i < 25; i++) {
      await createUser(getPrisma(), company.id, { email: `bulk-${i}@x.com` });
    }

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users?limit=10',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    const body = res.json<_ListResponse>();
    expect(body.items.length).toBe(10);
    expect(body.pagination.hasMore).toBe(true);
    expect(body.pagination.nextCursor).toBeTruthy();

    const res2 = await app.inject({
      method: 'GET',
      url: `/api/v1/users?limit=10&cursor=${encodeURIComponent(body.pagination.nextCursor!)}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    const body2 = res2.json<_ListResponse>();
    expect(body2.items.length).toBe(10);
    const ids1 = new Set(body.items.map((u) => u.id));
    body2.items.forEach((u) => expect(ids1.has(u.id)).toBe(false));
  });

  it('AGENT can list users (read-only access)', async () => {
    const company = await createCompany(getPrisma());
    const { user: agent, password } = await createUser(getPrisma(), company.id, { role: 'AGENT' });
    const tokens = await loginAs(app, agent.email, password);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('UsersController GET /users/:id (e2e)', () => {
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

  it('returns user with departments populated', async () => {
    const { company, tokens } = await setupAdmin(app);
    const dept = await createDepartment(getPrisma(), company.id, { name: 'Vendas' });
    const { user: agent } = await createUser(getPrisma(), company.id, { role: 'AGENT' });
    await getPrisma().userDepartment.create({
      data: { userId: agent.id, departmentId: dept.id },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/users/${agent.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<UserDto>();
    expect(body.id).toBe(agent.id);
    expect(body.departments).toEqual([{ id: dept.id, name: 'Vendas' }]);
  });

  it('returns 404 when user belongs to another tenant', async () => {
    const { tokens } = await setupAdmin(app);
    const otherCompany = await createCompany(getPrisma());
    const { user: cross } = await createUser(getPrisma(), otherCompany.id);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/users/${cross.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json<ErrorBody>().message).toBe('Usuário não encontrado');
  });

  it('returns 404 when user is soft-deleted', async () => {
    const { company, tokens } = await setupAdmin(app);
    const { user } = await createUser(getPrisma(), company.id);
    await getPrisma().user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/users/${user.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('UsersController PATCH /users/:id (e2e)', () => {
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

  it('admin updates name and password of another user (verifies bcrypt change)', async () => {
    const { company, tokens } = await setupAdmin(app);
    const { user: target } = await createUser(getPrisma(), company.id, {
      role: 'AGENT',
      email: 'before@x.com',
    });
    const beforeHash = (await getPrisma().user.findUnique({ where: { id: target.id } }))!
      .passwordHash;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${target.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { name: 'Renamed', password: 'new-pass-99999' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<UserDto>().name).toBe('Renamed');

    const afterHash = (await getPrisma().user.findUnique({ where: { id: target.id } }))!
      .passwordHash;
    expect(afterHash).not.toBe(beforeHash);
    expect(await bcrypt.compare('new-pass-99999', afterHash)).toBe(true);
  });

  it('returns 409 when demoting the last ADMIN (TC-USER-2b)', async () => {
    const { admin, tokens } = await setupAdmin(app);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${admin.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { role: 'AGENT' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorBody>().message).toBe('Não é possível remover o último ADMIN do tenant');
  });

  it('allows demoting an ADMIN when another ADMIN exists', async () => {
    const { company, tokens } = await setupAdmin(app);
    const { user: secondAdmin } = await createUser(getPrisma(), company.id, {
      role: 'ADMIN',
      email: 'admin2@x.com',
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${secondAdmin.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { role: 'AGENT' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<UserDto>().role).toBe('AGENT');
  });

  it('returns 403 when AGENT tries to PATCH another user (TC-USER-6)', async () => {
    const company = await createCompany(getPrisma());
    const { user: agent, password } = await createUser(getPrisma(), company.id, { role: 'AGENT' });
    const { user: other } = await createUser(getPrisma(), company.id, {
      role: 'AGENT',
      email: 'other@x.com',
    });
    const tokens = await loginAs(app, agent.email, password);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${other.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { name: 'Hijack' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 409 when changing email to one already in use', async () => {
    const { company, tokens } = await setupAdmin(app);
    const { user: target } = await createUser(getPrisma(), company.id, {
      role: 'AGENT',
      email: 'me@x.com',
    });
    await createUser(getPrisma(), company.id, { email: 'taken@x.com' });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${target.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { email: 'taken@x.com' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorBody>().message).toBe('Email já cadastrado');
  });

  it('returns 404 when target is in another tenant (multi-tenant isolation)', async () => {
    const { tokens } = await setupAdmin(app);
    const otherCompany = await createCompany(getPrisma());
    const { user: cross } = await createUser(getPrisma(), otherCompany.id);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${cross.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { name: 'XX' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('UsersController DELETE /users/:id (e2e)', () => {
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

  it('soft-deletes a non-last ADMIN target', async () => {
    const { company, tokens } = await setupAdmin(app);
    const { user: target } = await createUser(getPrisma(), company.id, { role: 'AGENT' });

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/users/${target.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(res.statusCode).toBe(204);

    const persisted = await getPrisma().user.findUnique({ where: { id: target.id } });
    expect(persisted?.deletedAt).not.toBeNull();
  });

  it('subsequent GET returns 404 after DELETE', async () => {
    const { company, tokens } = await setupAdmin(app);
    const { user: target } = await createUser(getPrisma(), company.id, { role: 'AGENT' });

    await app.inject({
      method: 'DELETE',
      url: `/api/v1/users/${target.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/users/${target.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 409 when deleting the last ADMIN (TC-USER-2a)', async () => {
    const { admin, tokens } = await setupAdmin(app);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/users/${admin.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorBody>().message).toBe('Não é possível remover o último ADMIN do tenant');
  });

  it('returns 403 when caller is AGENT', async () => {
    const company = await createCompany(getPrisma());
    const { user: agent, password } = await createUser(getPrisma(), company.id, { role: 'AGENT' });
    const { user: target } = await createUser(getPrisma(), company.id, {
      role: 'AGENT',
      email: 'other@x.com',
    });
    const tokens = await loginAs(app, agent.email, password);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/users/${target.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when target is in another tenant', async () => {
    const { tokens } = await setupAdmin(app);
    const otherCompany = await createCompany(getPrisma());
    const { user: cross } = await createUser(getPrisma(), otherCompany.id);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/users/${cross.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('blocks recreating with the same email after soft-delete (decision §1.1)', async () => {
    const { company, tokens } = await setupAdmin(app);
    const { user: target } = await createUser(getPrisma(), company.id, {
      role: 'AGENT',
      email: 'will-be-deleted@x.com',
    });
    await app.inject({
      method: 'DELETE',
      url: `/api/v1/users/${target.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        name: 'New',
        email: 'will-be-deleted@x.com',
        password: 'valid-pass-1234',
        role: 'AGENT',
        departmentIds: [],
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorBody>().message).toBe('Email já cadastrado');
  });
});
