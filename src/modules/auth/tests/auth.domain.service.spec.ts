import { createHash } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { User } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../database/prisma.service';
import { AuthDomainService } from '../services/auth.domain.service';

const baseUser = (overrides: Partial<User> = {}): User => ({
  id: '00000000-0000-7000-8000-000000000001',
  companyId: '00000000-0000-7000-8000-00000000aaaa',
  name: 'Test',
  email: 'user@test.local',
  passwordHash: '',
  role: 'AGENT',
  absenceMessage: null,
  absenceActive: false,
  lastSeenAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...overrides,
});

describe('AuthDomainService.validateCredentials', () => {
  let service: AuthDomainService;
  let prisma: { user: { findUnique: ReturnType<typeof vi.fn> } };

  beforeEach(() => {
    prisma = { user: { findUnique: vi.fn() } };
    service = new AuthDomainService(prisma as unknown as PrismaService, {} as never);
  });

  it('returns the user when email and password match', async () => {
    const passwordHash = await bcrypt.hash('valid-pass', 12);
    prisma.user.findUnique.mockResolvedValue(baseUser({ passwordHash }));

    const result = await service.validateCredentials('user@test.local', 'valid-pass');

    expect(result.email).toBe('user@test.local');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'user@test.local' },
    });
  });

  it('throws UnauthorizedException with generic message when email not found', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.validateCredentials('missing@x.com', 'whatever')).rejects.toThrow(
      new UnauthorizedException('E-mail ou senha inválidos'),
    );
  });

  it('throws UnauthorizedException with same generic message on wrong password', async () => {
    const passwordHash = await bcrypt.hash('correct-pass', 12);
    prisma.user.findUnique.mockResolvedValue(baseUser({ passwordHash }));

    await expect(service.validateCredentials('user@test.local', 'wrong-pass')).rejects.toThrow(
      new UnauthorizedException('E-mail ou senha inválidos'),
    );
  });

  it('throws UnauthorizedException when user is soft-deleted', async () => {
    const passwordHash = await bcrypt.hash('valid-pass', 12);
    prisma.user.findUnique.mockResolvedValue(baseUser({ passwordHash, deletedAt: new Date() }));

    await expect(service.validateCredentials('user@test.local', 'valid-pass')).rejects.toThrow(
      new UnauthorizedException('E-mail ou senha inválidos'),
    );
  });
});

describe('AuthDomainService.issueTokens', () => {
  let service: AuthDomainService;
  let prisma: { refreshToken: { create: ReturnType<typeof vi.fn> } };
  let jwt: { sign: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prisma = { refreshToken: { create: vi.fn().mockResolvedValue({}) } };
    jwt = {
      sign: vi.fn(
        (payload: object, options: { secret: string; expiresIn: string }) =>
          `signed:${options.secret}:${JSON.stringify(payload)}`,
      ),
    };
    service = new AuthDomainService(prisma as never, jwt as unknown as JwtService);
    process.env.JWT_ACCESS_SECRET = 'access-secret';
    process.env.JWT_REFRESH_SECRET = 'refresh-secret';
  });

  it('emits an access JWT with sub/companyId/role and a refresh JWT with jti', async () => {
    const user = baseUser({ role: 'ADMIN' });

    const result = await service.issueTokens(user, '127.0.0.1', 'jest', undefined);

    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ sub: user.id, companyId: user.companyId, role: 'ADMIN' }),
      expect.objectContaining({ secret: 'access-secret', expiresIn: '15m' }),
    );
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ sub: user.id, jti: expect.any(String) as unknown }),
      expect.objectContaining({ secret: 'refresh-secret', expiresIn: '7d' }),
    );
    expect(result.accessToken).toContain('access-secret');
    expect(result.refreshToken).toContain('refresh-secret');
  });

  it('persists a RefreshToken row with sha256(jti) hex hash and tenant context', async () => {
    const user = baseUser();

    await service.issueTokens(user, '127.0.0.1', 'jest', undefined);

    expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    const call = prisma.refreshToken.create.mock.calls[0]![0] as unknown as {
      data: { tokenHash: string; userId: string; companyId: string; expiresAt: Date };
    };
    expect(call.data.userId).toBe(user.id);
    expect(call.data.companyId).toBe(user.companyId);
    expect(call.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(call.data.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('AuthDomainService.rotateRefresh', () => {
  let service: AuthDomainService;
  let prisma: {
    user: { findUnique: ReturnType<typeof vi.fn> };
    refreshToken: {
      findUnique: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let jwt: { sign: ReturnType<typeof vi.fn>; verify: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prisma = {
      user: { findUnique: vi.fn() },
      refreshToken: {
        findUnique: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
    };
    jwt = {
      sign: vi.fn(() => 'new-token'),
      verify: vi.fn(),
    };
    service = new AuthDomainService(prisma as never, jwt as unknown as JwtService);
    process.env.JWT_ACCESS_SECRET = 'access-secret';
    process.env.JWT_REFRESH_SECRET = 'refresh-secret';
  });

  function setupValidRefreshRow(jti: string, user: User): void {
    const tokenHash = createHash('sha256').update(jti).digest('hex');
    jwt.verify.mockReturnValue({ sub: user.id, jti, exp: Math.floor(Date.now() / 1000) + 3600 });
    prisma.refreshToken.findUnique.mockResolvedValue({
      tokenHash,
      userId: user.id,
      companyId: user.companyId,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    });
    prisma.user.findUnique.mockResolvedValue(user);
  }

  it('rotates: revokes old refresh and emits a new pair (with user)', async () => {
    const user = baseUser();
    setupValidRefreshRow('jti-1', user);

    const result = await service.rotateRefresh('any-jwt', null, null);

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        tokenHash: createHash('sha256').update('jti-1').digest('hex'),
        revokedAt: null,
      },
      data: { revokedAt: expect.any(Date) as unknown },
    });
    expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    expect(result.user.id).toBe(user.id);
    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
  });

  it('throws 401 when JWT verify fails', async () => {
    jwt.verify.mockImplementation(() => {
      throw new Error('invalid signature');
    });

    await expect(service.rotateRefresh('bad', null, null)).rejects.toThrow(
      new UnauthorizedException('Sessão expirada. Faça login novamente.'),
    );
  });

  it('throws 401 when refresh row not found in DB', async () => {
    jwt.verify.mockReturnValue({ sub: 'u', jti: 'jti-x' });
    prisma.refreshToken.findUnique.mockResolvedValue(null);

    await expect(service.rotateRefresh('any', null, null)).rejects.toThrow(UnauthorizedException);
  });

  it('throws 401 when refresh row already revoked', async () => {
    const user = baseUser();
    setupValidRefreshRow('jti-2', user);
    prisma.refreshToken.findUnique.mockResolvedValueOnce({
      tokenHash: createHash('sha256').update('jti-2').digest('hex'),
      userId: user.id,
      companyId: user.companyId,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
    });

    await expect(service.rotateRefresh('any', null, null)).rejects.toThrow(UnauthorizedException);
  });

  it('throws 401 when refresh row already expired', async () => {
    const user = baseUser();
    setupValidRefreshRow('jti-3', user);
    prisma.refreshToken.findUnique.mockResolvedValueOnce({
      tokenHash: createHash('sha256').update('jti-3').digest('hex'),
      userId: user.id,
      companyId: user.companyId,
      expiresAt: new Date(Date.now() - 1000),
      revokedAt: null,
    });

    await expect(service.rotateRefresh('any', null, null)).rejects.toThrow(UnauthorizedException);
  });

  it('throws 401 when associated user is soft-deleted', async () => {
    const user = baseUser({ deletedAt: new Date() });
    setupValidRefreshRow('jti-4', user);

    await expect(service.rotateRefresh('any', null, null)).rejects.toThrow(UnauthorizedException);
  });
});
