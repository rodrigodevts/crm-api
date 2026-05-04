import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Tag } from '@prisma/client';
import { PrismaService } from '@/database/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class TagsDomainService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string, companyId: string, tx?: Prisma.TransactionClient): Promise<Tag> {
    const db: Db = tx ?? this.prisma;
    const tag = await db.tag.findFirst({ where: { id, companyId } });
    if (!tag) throw new NotFoundException('Tag não encontrada');
    return tag;
  }
}
