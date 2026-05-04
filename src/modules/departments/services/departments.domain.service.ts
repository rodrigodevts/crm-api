import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Department } from '@prisma/client';
import { PrismaService } from '@/database/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class DepartmentsDomainService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(
    id: string,
    companyId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Department> {
    const db: Db = tx ?? this.prisma;
    const dept = await db.department.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!dept) {
      throw new NotFoundException('Departamento não encontrado');
    }
    return dept;
  }

  async findByIdWithUsers(
    id: string,
    companyId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<
    Department & {
      users: Array<{
        user: { id: string; name: string; role: 'SUPER_ADMIN' | 'ADMIN' | 'SUPERVISOR' | 'AGENT' };
      }>;
    }
  > {
    const db: Db = tx ?? this.prisma;
    const dept = await db.department.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        users: {
          where: { user: { deletedAt: null } },
          include: {
            user: { select: { id: true, name: true, role: true } },
          },
        },
      },
    });
    if (!dept) {
      throw new NotFoundException('Departamento não encontrado');
    }
    return dept;
  }

  async assertNameAvailable(
    name: string,
    companyId: string,
    tx: Prisma.TransactionClient,
    exceptId?: string,
  ): Promise<void> {
    const existing = await tx.department.findFirst({
      where: { companyId, name, deletedAt: null },
    });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException('Já existe um departamento com este nome');
    }
  }
}
