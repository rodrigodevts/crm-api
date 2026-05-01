import { Injectable, NotImplementedException } from '@nestjs/common';

@Injectable()
export class <%= classify(name) %>DomainService {
  // TODO: injetar PrismaService quando criado o módulo Prisma

  list(_companyId: string): Promise<unknown[]> {
    // TODO: tx.<%= camelize(name) %>.findMany({ where: { companyId, ... } })
    throw new NotImplementedException();
  }

  getById(_id: string, _companyId: string): Promise<unknown> {
    // TODO: tx.<%= camelize(name) %>.findFirstOrThrow({ where: { id, companyId } })
    throw new NotImplementedException();
  }

  create(_companyId: string, _input: unknown): Promise<unknown> {
    // TODO: regra de negócio + tx.<%= camelize(name) %>.create
    throw new NotImplementedException();
  }

  update(_id: string, _companyId: string, _input: unknown): Promise<unknown> {
    // TODO: regra de negócio + tx.<%= camelize(name) %>.update
    throw new NotImplementedException();
  }

  remove(_id: string, _companyId: string): Promise<void> {
    // TODO: tx.<%= camelize(name) %>.update({ data: { deletedAt: new Date() } })
    throw new NotImplementedException();
  }
}
