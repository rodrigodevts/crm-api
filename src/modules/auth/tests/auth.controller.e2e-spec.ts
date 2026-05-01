import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { getPrisma } from '../../../../test/setup-prisma';
import { bootstrapTestApp } from '../../../../test/e2e/setup-app';
import { createCompany, createUser, truncateAll } from '../../../../test/e2e/factories';
import { AuthDomainService } from '../services/auth.domain.service';

interface AuthBody {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; companyId: string; name: string; role: string };
}

interface ErrorBody {
  message: string;
}

interface ZodErrorBody {
  errors: { field: string; message: string; code: string }[];
}

describe('AuthController (e2e) — login', () => {
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

  it('logs in with correct credentials and returns tokens + user', async () => {
    const company = await createCompany(getPrisma());
    const { user, password } = await createUser(getPrisma(), company.id, {
      email: 'agent@x.com',
      role: 'AGENT',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'agent@x.com', password },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<AuthBody>();
    expect(body.accessToken).toBeDefined();
    expect(body.refreshToken).toBeDefined();
    expect(body.user.id).toBe(user.id);
    expect(body.user.email).toBe('agent@x.com');

    const tokensInDb = await getPrisma().refreshToken.count({ where: { userId: user.id } });
    expect(tokensInDb).toBe(1);
  });

  it('returns 401 with generic message on wrong password', async () => {
    const company = await createCompany(getPrisma());
    await createUser(getPrisma(), company.id, { email: 'agent@x.com', password: 'right-pass-xx' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'agent@x.com', password: 'wrong-pass-xx' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json<ErrorBody>().message).toBe('E-mail ou senha inválidos');
  });

  it('returns 401 with same message on unknown email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'ghost@x.com', password: 'irrelevant-pass' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json<ErrorBody>().message).toBe('E-mail ou senha inválidos');
  });

  it('returns 401 when user is soft-deleted', async () => {
    const company = await createCompany(getPrisma());
    const { user, password } = await createUser(getPrisma(), company.id, {
      email: 'agent@x.com',
    });
    await getPrisma().user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'agent@x.com', password },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when password < 8 chars (Zod)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'agent@x.com', password: 'short' },
    });

    expect(res.statusCode).toBe(400);
    const errors = res.json<ZodErrorBody>().errors;
    expect(errors[0]?.field).toBe('password');
  });
});

describe('AuthController (e2e) — refresh', () => {
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

  async function login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });
    return res.json<{ accessToken: string; refreshToken: string }>();
  }

  it('rotates tokens and revokes the old refresh', async () => {
    const company = await createCompany(getPrisma());
    const { password } = await createUser(getPrisma(), company.id, { email: 'agent@x.com' });
    const first = await login('agent@x.com', password);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: first.refreshToken },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<AuthBody>();
    expect(body.refreshToken).not.toBe(first.refreshToken);

    const revoked = await getPrisma().refreshToken.findFirst({
      where: { revokedAt: { not: null } },
    });
    expect(revoked).toBeTruthy();
  });

  it('returns 401 when reusing an already-revoked refresh', async () => {
    const company = await createCompany(getPrisma());
    const { password } = await createUser(getPrisma(), company.id, { email: 'agent@x.com' });
    const first = await login('agent@x.com', password);

    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: first.refreshToken },
    });

    const reuse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: first.refreshToken },
    });
    expect(reuse.statusCode).toBe(401);
  });

  it('returns 401 on malformed JWT', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: 'not-a-jwt' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('AuthController (e2e) — logout', () => {
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

  it('revokes the device refresh and subsequent refresh returns 401', async () => {
    const company = await createCompany(getPrisma());
    const { password } = await createUser(getPrisma(), company.id, { email: 'agent@x.com' });
    const login1 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'agent@x.com', password },
    });
    const tokens = login1.json<AuthBody>();

    const out = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      payload: { refreshToken: tokens.refreshToken },
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(out.statusCode).toBe(204);

    const reuse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: tokens.refreshToken },
    });
    expect(reuse.statusCode).toBe(401);
  });
});

describe('AuthController (e2e) — force-logout via domain + multi-tenant isolation', () => {
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

  it('revokeAllRefreshTokens revokes only target user, not other tenant', async () => {
    const companyA = await createCompany(getPrisma(), { slug: 'co-a' });
    const companyB = await createCompany(getPrisma(), { slug: 'co-b' });
    const { user: userA, password: passA } = await createUser(getPrisma(), companyA.id, {
      email: 'a@x.com',
    });
    const { password: passB } = await createUser(getPrisma(), companyB.id, {
      email: 'b@x.com',
    });

    const loginA = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'a@x.com', password: passA },
    });
    const loginB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'b@x.com', password: passB },
    });
    const tokensA = loginA.json<AuthBody>();
    const tokensB = loginB.json<AuthBody>();

    const authDomain = app.get(AuthDomainService);
    const revoked = await authDomain.revokeAllRefreshTokens(userA.id, companyA.id);
    expect(revoked).toBe(1);

    const refreshA = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: tokensA.refreshToken },
    });
    expect(refreshA.statusCode).toBe(401);

    const refreshB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: tokensB.refreshToken },
    });
    expect(refreshB.statusCode).toBe(200);
  });
});
