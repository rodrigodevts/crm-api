import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class UsersDomainService {
  constructor(private readonly prisma: PrismaService) {}

  assertNotSuperAdmin(target: User): void {
    if (target.role === 'SUPER_ADMIN') {
      throw new ForbiddenException('Você não tem permissão para esta ação');
    }
  }

  async findByEmailRaw(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async assertEmailNotInUse(email: string, exceptUserId?: string): Promise<void> {
    const existing = await this.findByEmailRaw(email);
    if (existing && existing.id !== exceptUserId) {
      throw new ConflictException('Email já cadastrado');
    }
  }
}
