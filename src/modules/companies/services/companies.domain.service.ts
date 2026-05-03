import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
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
}
