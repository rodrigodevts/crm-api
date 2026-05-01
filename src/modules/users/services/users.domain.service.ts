import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, User } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

export type UserWithDepartments = User & {
  departments: Array<{ department: { id: string; name: string } }>;
};

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

  async assertNotLastAdmin(
    userId: string,
    companyId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const others = await tx.user.count({
      where: {
        companyId,
        role: 'ADMIN',
        deletedAt: null,
        id: { not: userId },
      },
    });
    if (others === 0) {
      throw new ConflictException('Não é possível remover o último ADMIN do tenant');
    }
  }

  async findByIdWithDepartments(
    userId: string,
    companyId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<UserWithDepartments> {
    const db = tx ?? this.prisma;
    const user = await db.user.findFirst({
      where: { id: userId, companyId, deletedAt: null },
      include: {
        departments: {
          include: {
            department: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    return user;
  }
}
