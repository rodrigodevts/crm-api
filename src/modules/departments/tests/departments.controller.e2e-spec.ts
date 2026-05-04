import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Company, Department, User } from '@prisma/client';
import { bootstrapTestApp } from '../../../../test/e2e/setup-app';
import {
  createCompany,
  createDepartment,
  createUser,
  loginAs,
  truncateAll,
} from '../../../../test/e2e/factories';
import { getPrisma } from '../../../../test/setup-prisma';

interface DepartmentDto {
  id: string;
  companyId: string;
  name: string;
  active: boolean;
  greetingMessage: string | null;
  outOfHoursMessage: string | null;
  workingHours: unknown;
  slaResponseMinutes: number | null;
  slaResolutionMinutes: number | null;
  distributionMode: 'MANUAL' | 'RANDOM' | 'BALANCED' | 'SEQUENTIAL';
  createdAt: string;
  updatedAt: string;
}

interface DepartmentDetailDto extends DepartmentDto {
  users: Array<{ id: string; name: string; role: string }>;
}

interface ListResponse {
  items: DepartmentDto[];
  pagination: { nextCursor: string | null; hasMore: boolean };
}

interface ErrorBody {
  message: string;
  errors?: Array<{ field: string; message: string; code: string }>;
}

describe('DepartmentsController (e2e) — happy paths', () => {
  let app: NestFastifyApplication;
  let company: Company;
  let admin: { user: User; password: string };
  let agent: { user: User; password: string };
  let tokenAdmin: string;
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
    agent = await createUser(getPrisma(), company.id, { role: 'AGENT' });
    ({ accessToken: tokenAdmin } = await loginAs(app, admin.user.email, admin.password));
    ({ accessToken: tokenAgent } = await loginAs(app, agent.user.email, agent.password));
  });

  it('POST /departments como ADMIN cria depto (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/departments',
      headers: { authorization: `Bearer ${tokenAdmin}` },
      payload: {
        name: 'Suporte',
        workingHours: {
          monday: [{ from: '09:00', to: '18:00' }],
          tuesday: [],
          wednesday: [],
          thursday: [],
          friday: [],
          saturday: [],
          sunday: [],
          holiday: [],
        },
        slaResponseMinutes: 30,
        distributionMode: 'RANDOM',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<DepartmentDto>();
    expect(body).toMatchObject({
      name: 'Suporte',
      companyId: company.id,
      slaResponseMinutes: 30,
      distributionMode: 'RANDOM',
      active: true,
    });
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/i);

    const count = await getPrisma().department.count({ where: { companyId: company.id } });
    expect(count).toBe(1);
  });

  it('GET /departments como AGENT lista deptos do tenant (200)', async () => {
    await createDepartment(getPrisma(), company.id, { name: 'Suporte' });
    await createDepartment(getPrisma(), company.id, { name: 'Vendas' });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/departments',
      headers: { authorization: `Bearer ${tokenAgent}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<ListResponse>();
    expect(body.items).toHaveLength(2);
    expect(body.pagination.hasMore).toBe(false);
    expect(body.pagination.nextCursor).toBeNull();
  });

  it('GET /departments?sort=name ordena alfabeticamente', async () => {
    await createDepartment(getPrisma(), company.id, { name: 'Vendas' });
    await createDepartment(getPrisma(), company.id, { name: 'Atendimento' });
    await createDepartment(getPrisma(), company.id, { name: 'Suporte' });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/departments?sort=name',
      headers: { authorization: `Bearer ${tokenAgent}` },
    });

    expect(res.statusCode).toBe(200);
    const names = res.json<ListResponse>().items.map((d) => d.name);
    expect(names).toEqual(['Atendimento', 'Suporte', 'Vendas']);
  });

  it('GET /departments paginates com cursor (limit=1)', async () => {
    await createDepartment(getPrisma(), company.id, { name: 'Suporte' });
    await createDepartment(getPrisma(), company.id, { name: 'Vendas' });

    const page1 = await app.inject({
      method: 'GET',
      url: '/api/v1/departments?limit=1&sort=name',
      headers: { authorization: `Bearer ${tokenAgent}` },
    });
    expect(page1.statusCode).toBe(200);
    const page1Body = page1.json<ListResponse>();
    expect(page1Body.items).toHaveLength(1);
    expect(page1Body.pagination.hasMore).toBe(true);
    const cursor = page1Body.pagination.nextCursor!;

    const page2 = await app.inject({
      method: 'GET',
      url: `/api/v1/departments?limit=1&sort=name&cursor=${encodeURIComponent(cursor)}`,
      headers: { authorization: `Bearer ${tokenAgent}` },
    });
    expect(page2.statusCode).toBe(200);
    const page2Body = page2.json<ListResponse>();
    expect(page2Body.items).toHaveLength(1);
    expect(page2Body.pagination.hasMore).toBe(false);
  });

  it('GET /departments/:id retorna users associados', async () => {
    const dept = await createDepartment(getPrisma(), company.id, { name: 'Suporte' });
    await getPrisma().userDepartment.create({
      data: { userId: agent.user.id, departmentId: dept.id },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/departments/${dept.id}`,
      headers: { authorization: `Bearer ${tokenAgent}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<DepartmentDetailDto>();
    expect(body.id).toBe(dept.id);
    expect(body.users).toHaveLength(1);
    expect(body.users[0]).toMatchObject({
      id: agent.user.id,
      name: agent.user.name,
      role: 'AGENT',
    });
    // Sem email no payload (decisão 1.3)
    expect(body.users[0]).not.toHaveProperty('email');
  });

  it('PATCH /departments/:id como ADMIN atualiza campos (200)', async () => {
    const dept = await createDepartment(getPrisma(), company.id, { name: 'Suporte' });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/departments/${dept.id}`,
      headers: { authorization: `Bearer ${tokenAdmin}` },
      payload: {
        name: 'Suporte 24h',
        slaResponseMinutes: 60,
        distributionMode: 'BALANCED',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<DepartmentDto>();
    expect(body).toMatchObject({
      name: 'Suporte 24h',
      slaResponseMinutes: 60,
      distributionMode: 'BALANCED',
    });

    const fromDb = await getPrisma().department.findUnique({ where: { id: dept.id } });
    expect(fromDb?.name).toBe('Suporte 24h');
  });

  it('DELETE /departments/:id em depto vazio (204)', async () => {
    const dept = await createDepartment(getPrisma(), company.id);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/departments/${dept.id}`,
      headers: { authorization: `Bearer ${tokenAdmin}` },
    });

    expect(res.statusCode).toBe(204);

    const fromDb = await getPrisma().department.findUnique({ where: { id: dept.id } });
    expect(fromDb?.deletedAt).not.toBeNull();

    const get = await app.inject({
      method: 'GET',
      url: `/api/v1/departments/${dept.id}`,
      headers: { authorization: `Bearer ${tokenAdmin}` },
    });
    expect(get.statusCode).toBe(404);
  });

  it('DELETE /departments/:id com 2 AGENTs assigned limpa UserDepartment (204)', async () => {
    const dept: Department = await createDepartment(getPrisma(), company.id);
    const agent2 = await createUser(getPrisma(), company.id, { role: 'AGENT' });
    await getPrisma().userDepartment.createMany({
      data: [
        { userId: agent.user.id, departmentId: dept.id },
        { userId: agent2.user.id, departmentId: dept.id },
      ],
    });

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/departments/${dept.id}`,
      headers: { authorization: `Bearer ${tokenAdmin}` },
    });
    expect(res.statusCode).toBe(204);

    const links = await getPrisma().userDepartment.count({ where: { departmentId: dept.id } });
    expect(links).toBe(0);

    // Os AGENTs continuam existindo
    const a1 = await getPrisma().user.findUnique({ where: { id: agent.user.id } });
    const a2 = await getPrisma().user.findUnique({ where: { id: agent2.user.id } });
    expect(a1?.deletedAt).toBeNull();
    expect(a2?.deletedAt).toBeNull();
  });
});

// Re-export interfaces para reuso nas próximas tasks (evita redefinir).
export type { DepartmentDto, DepartmentDetailDto, ListResponse, ErrorBody };
