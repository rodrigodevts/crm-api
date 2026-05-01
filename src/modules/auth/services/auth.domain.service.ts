import { createHash, randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { Prisma, User } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

const GENERIC_LOGIN_ERROR = 'E-mail ou senha inválidos';
const GENERIC_REFRESH_ERROR = 'Sessão expirada. Faça login novamente.';

const ACCESS_TTL = '15m';
const REFRESH_TTL = '7d';
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

interface RefreshPayload {
  sub: string;
  jti: string;
  exp?: number;
}

interface RotateResult extends IssuedTokens {
  user: User;
}

@Injectable()
export class AuthDomainService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async validateCredentials(email: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.deletedAt !== null) {
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }
    return user;
  }

  async issueTokens(
    user: User,
    ipAddress: string | null,
    userAgent: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<IssuedTokens> {
    const db = tx ?? this.prisma;
    const accessSecret = process.env.JWT_ACCESS_SECRET;
    const refreshSecret = process.env.JWT_REFRESH_SECRET;
    if (!accessSecret || !refreshSecret) {
      throw new Error('JWT secrets not configured');
    }

    const accessToken = this.jwt.sign(
      { sub: user.id, companyId: user.companyId, role: user.role },
      { secret: accessSecret, expiresIn: ACCESS_TTL },
    );

    const jti = randomUUID();
    const refreshToken = this.jwt.sign(
      { sub: user.id, jti },
      { secret: refreshSecret, expiresIn: REFRESH_TTL },
    );

    const tokenHash = this.hashJti(jti);
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);

    await db.refreshToken.create({
      data: {
        companyId: user.companyId,
        userId: user.id,
        tokenHash,
        expiresAt,
        ipAddress,
        userAgent,
      },
    });

    return { accessToken, refreshToken };
  }

  async rotateRefresh(
    refreshToken: string,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<RotateResult> {
    const refreshSecret = process.env.JWT_REFRESH_SECRET;
    if (!refreshSecret) throw new Error('JWT_REFRESH_SECRET not configured');

    let payload: RefreshPayload;
    try {
      payload = this.jwt.verify<RefreshPayload>(refreshToken, { secret: refreshSecret });
    } catch {
      throw new UnauthorizedException(GENERIC_REFRESH_ERROR);
    }

    return this.prisma.$transaction(async (tx) => {
      const tokenHash = this.hashJti(payload.jti);
      const row = await tx.refreshToken.findUnique({ where: { tokenHash } });
      if (!row || row.revokedAt !== null || row.expiresAt.getTime() <= Date.now()) {
        throw new UnauthorizedException(GENERIC_REFRESH_ERROR);
      }
      if (row.userId !== payload.sub) {
        throw new UnauthorizedException(GENERIC_REFRESH_ERROR);
      }

      const user = await tx.user.findUnique({ where: { id: row.userId } });
      if (!user || user.deletedAt !== null) {
        throw new UnauthorizedException(GENERIC_REFRESH_ERROR);
      }

      await tx.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      const tokens = await this.issueTokens(user, ipAddress, userAgent, tx);
      return { ...tokens, user };
    });
  }

  async revokeRefreshTokenByJti(jti: string, userId: string, companyId: string): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashJti(jti), userId, companyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  async revokeAllRefreshTokens(userId: string, companyId: string): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, companyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  hashJti(jti: string): string {
    return createHash('sha256').update(jti).digest('hex');
  }
}
