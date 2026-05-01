import { Injectable, NotImplementedException } from '@nestjs/common';

@Injectable()
export class <%= classify(name) %>DomainService {
  // TODO: injetar PrismaService quando criado o módulo Prisma

  async list(_companyId: string): Promise<unknown[]> {
    // TODO: tx.<%= camelize(name) %>.findMany({ where: { companyId, ... } })
    throw new NotImplementedException();
  }

  async getById(_id: string, _companyId: string): Promise<unknown> {
    // TODO: tx.<%= camelize(name) %>.findFirstOrThrow({ where: { id, companyId } })
    throw new NotImplementedException();
  }

  async create(_companyId: string, _input: unknown): Promise<unknown> {
    // TODO: regra de negócio + tx.<%= camelize(name) %>.create
    throw new NotImplementedException();
  }

  async update(_id: string, _companyId: string, _input: unknown): Promise<unknown> {
    // TODO: regra de negócio + tx.<%= camelize(name) %>.update
    throw new NotImplementedException();
  }

  async remove(_id: string, _companyId: string): Promise<void> {
    // TODO: tx.<%= camelize(name) %>.update({ data: { deletedAt: new Date() } })
    throw new NotImplementedException();
  }
}
