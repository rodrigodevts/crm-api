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
