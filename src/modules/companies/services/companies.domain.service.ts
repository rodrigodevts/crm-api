import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Company, Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class CompaniesDomainService {
  constructor(private readonly prisma: PrismaService) {}

  async assertSlugAvailable(
    slug: string,
    tx: Prisma.TransactionClient,
    exceptId?: string,
  ): Promise<void> {
    const existing = await tx.company.findFirst({ where: { slug } });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException('Slug já em uso');
    }
  }

  async assertPlanIsActive(planId: string, tx: Prisma.TransactionClient): Promise<void> {
    const plan = await tx.plan.findFirst({ where: { id: planId, active: true } });
    if (!plan) {
      throw new UnprocessableEntityException('Plano não encontrado ou inativo');
    }
  }

  async assertNoActiveUsers(companyId: string, tx: Prisma.TransactionClient): Promise<void> {
    const count = await tx.user.count({
      where: { companyId, deletedAt: null },
    });
    if (count > 0) {
      throw new ConflictException(
        'Não é possível excluir empresa com usuários ativos. Remova-os primeiro.',
      );
    }
  }

  async findById(id: string, tx?: Prisma.TransactionClient): Promise<Company> {
    const db = tx ?? this.prisma;
    const company = await db.company.findFirst({
      where: { id, deletedAt: null },
    });
    if (!company) {
      throw new NotFoundException('Empresa não encontrada');
    }
    return company;
  }
}
