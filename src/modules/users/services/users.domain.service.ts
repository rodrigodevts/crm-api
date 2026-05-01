import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Prisma, User } from '@prisma/client';
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

  async assertDepartmentsBelongToTenant(
    deptIds: string[],
    companyId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (deptIds.length === 0) return;
    const count = await tx.department.count({
      where: { id: { in: deptIds }, companyId, deletedAt: null },
    });
    if (count !== deptIds.length) {
      throw new BadRequestException('Departamento(s) não encontrado(s) no tenant');
    }
  }
}
