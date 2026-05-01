import { UnauthorizedException } from '@nestjs/common';
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
