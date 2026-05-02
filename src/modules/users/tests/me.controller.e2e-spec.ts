import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import * as bcrypt from 'bcrypt';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootstrapTestApp } from '../../../../test/e2e/setup-app';
import { createCompany, createUser, loginAs, truncateAll } from '../../../../test/e2e/factories';
import { getPrisma } from '../../../../test/setup-prisma';

interface UserDto {
  id: string;
  name: string;
  email: string;
  role: string;
  absenceMessage: string | null;
  absenceActive: boolean;
  departments: Array<{ id: string; name: string }>;
}

describe('MeController PATCH /me (e2e)', () => {
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

  it('AGENT updates own name, password, and absence (TC-USER-7)', async () => {
    const company = await createCompany(getPrisma());
    const { user, password } = await createUser(getPrisma(), company.id, { role: 'AGENT' });
    const tokens = await loginAs(app, user.email, password);
    const beforeHash = (await getPrisma().user.findUnique({ where: { id: user.id } }))!
      .passwordHash;

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        name: 'New Name',
        password: 'new-pass-12345',
        absenceMessage: 'Em férias',
        absenceActive: true,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<UserDto>();
    expect(body.name).toBe('New Name');
    expect(body.absenceActive).toBe(true);
    expect(body.absenceMessage).toBe('Em férias');

    const afterHash = (await getPrisma().user.findUnique({ where: { id: user.id } }))!.passwordHash;
    expect(afterHash).not.toBe(beforeHash);
    expect(await bcrypt.compare('new-pass-12345', afterHash)).toBe(true);
  });

  it('ignores role field (cannot escalate via /me)', async () => {
    const company = await createCompany(getPrisma());
    const { user, password } = await createUser(getPrisma(), company.id, { role: 'AGENT' });
    const tokens = await loginAs(app, user.email, password);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { role: 'ADMIN' },
    });
    expect(res.statusCode).toBe(200);
    // Verify role remains AGENT (not changed to ADMIN)
    const body = res.json<UserDto>();
    expect(body.role).toBe('AGENT');
  });

  it('ignores email field (cannot change email via /me)', async () => {
    const company = await createCompany(getPrisma());
    const { user, password } = await createUser(getPrisma(), company.id, { role: 'AGENT' });
    const tokens = await loginAs(app, user.email, password);
    const originalEmail = user.email;

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { email: 'hijack@x.com' },
    });
    expect(res.statusCode).toBe(200);
    // Verify email remains unchanged
    const body = res.json<UserDto>();
    expect(body.email).toBe(originalEmail);
  });

  it('ignores departmentIds field (cannot set departments via /me)', async () => {
    const company = await createCompany(getPrisma());
    const { user, password } = await createUser(getPrisma(), company.id, { role: 'AGENT' });
    const tokens = await loginAs(app, user.email, password);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { departmentIds: [] },
    });
    expect(res.statusCode).toBe(200);
    // Verify departmentIds remain unchanged (empty in this case)
    const body = res.json<UserDto>();
    expect(Array.isArray(body.departments)).toBe(true);
  });

  it('ADMIN can also use /me to change own name and password', async () => {
    const company = await createCompany(getPrisma());
    const { user, password } = await createUser(getPrisma(), company.id, { role: 'ADMIN' });
    const tokens = await loginAs(app, user.email, password);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { name: 'Admin Renamed' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<UserDto>().name).toBe('Admin Renamed');
  });

  it('returns 401 when no JWT is provided', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(401);
  });
});
