import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { User } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

const GENERIC_LOGIN_ERROR = 'E-mail ou senha inválidos';

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
}
