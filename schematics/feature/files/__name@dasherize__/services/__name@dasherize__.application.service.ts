import { Injectable, NotImplementedException } from '@nestjs/common';
import { <%= classify(name) %>DomainService } from './<%= dasherize(name) %>.domain.service';

@Injectable()
export class <%= classify(name) %>ApplicationService {
  constructor(private readonly domainService: <%= classify(name) %>DomainService) {}

  async list(_companyId: string): Promise<unknown> {
    // TODO: orquestrar listagem (paginação, filtros)
    throw new NotImplementedException();
  }

  async getById(_id: string, _companyId: string): Promise<unknown> {
    // TODO: orquestrar busca
    throw new NotImplementedException();
  }

  async create(_companyId: string, _input: unknown): Promise<unknown> {
    // TODO: orquestrar criação
    throw new NotImplementedException();
  }

  async update(_id: string, _companyId: string, _input: unknown): Promise<unknown> {
    // TODO: orquestrar atualização
    throw new NotImplementedException();
  }

  async remove(_id: string, _companyId: string): Promise<void> {
    // TODO: orquestrar remoção (soft delete se aplicável)
    throw new NotImplementedException();
  }
}
