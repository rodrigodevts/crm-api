import { createHash, randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { Prisma, User } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

const GENERIC_LOGIN_ERROR = 'E-mail ou senha inválidos';

const ACCESS_TTL = '15m';
const REFRESH_TTL = '7d';
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
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

  hashJti(jti: string): string {
    return createHash('sha256').update(jti).digest('hex');
  }
}
