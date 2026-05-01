import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import type { AuthResponse } from '../schemas/auth-response.schema';
import { AuthDomainService } from './auth.domain.service';

interface RefreshPayload {
  sub: string;
  jti: string;
}

@Injectable()
export class AuthApplicationService {
  constructor(
    private readonly authDomain: AuthDomainService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(
    email: string,
    password: string,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<AuthResponse> {
    const user = await this.authDomain.validateCredentials(email, password);
    const tokens = await this.authDomain.issueTokens(user, ipAddress, userAgent);
    return { ...tokens, user: this.toPublic(user) };
  }

  async refresh(
    refreshToken: string,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<AuthResponse> {
    const result = await this.authDomain.rotateRefresh(refreshToken, ipAddress, userAgent);
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: this.toPublic(result.user),
    };
  }

  async logout(refreshToken: string, currentUser: User): Promise<void> {
    let payload: RefreshPayload;
    try {
      payload = this.jwt.verify<RefreshPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
    }

    if (payload.sub !== currentUser.id) {
      throw new ForbiddenException('Você não tem permissão para esta ação');
    }

    await this.authDomain.revokeRefreshTokenByJti(
      payload.jti,
      currentUser.id,
      currentUser.companyId,
    );
  }

  private toPublic(user: User): AuthResponse['user'] {
    return {
      id: user.id,
      companyId: user.companyId,
      name: user.name,
      email: user.email,
      role: user.role,
    };
  }
}
