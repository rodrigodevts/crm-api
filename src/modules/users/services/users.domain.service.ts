import { Injectable, NotImplementedException } from '@nestjs/common';

@Injectable()
export class UsersDomainService {
  // TODO: injetar PrismaService quando criado o módulo Prisma

  list(_companyId: string): Promise<unknown[]> {
    // TODO: tx.users.findMany({ where: { companyId, ... } })
    throw new NotImplementedException();
  }

  getById(_id: string, _companyId: string): Promise<unknown> {
    // TODO: tx.users.findFirstOrThrow({ where: { id, companyId } })
    throw new NotImplementedException();
  }

  create(_companyId: string, _input: unknown): Promise<unknown> {
    // TODO: regra de negócio + tx.users.create
    throw new NotImplementedException();
  }

  update(_id: string, _companyId: string, _input: unknown): Promise<unknown> {
    // TODO: regra de negócio + tx.users.update
    throw new NotImplementedException();
  }

  remove(_id: string, _companyId: string): Promise<void> {
    // TODO: tx.users.update({ data: { deletedAt: new Date() } })
    throw new NotImplementedException();
  }
}
