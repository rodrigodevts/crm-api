import { Injectable, NotImplementedException } from '@nestjs/common';
import { <%= classify(name) %>DomainService } from './<%= dasherize(name) %>.domain.service';

@Injectable()
export class <%= classify(name) %>ApplicationService {
  constructor(private readonly domainService: <%= classify(name) %>DomainService) {}

  list(_companyId: string): Promise<unknown> {
    // TODO: orquestrar listagem (paginação, filtros)
    throw new NotImplementedException();
  }

  getById(_id: string, _companyId: string): Promise<unknown> {
    // TODO: orquestrar busca
    throw new NotImplementedException();
  }

  create(_companyId: string, _input: unknown): Promise<unknown> {
    // TODO: orquestrar criação
    throw new NotImplementedException();
  }

  update(_id: string, _companyId: string, _input: unknown): Promise<unknown> {
    // TODO: orquestrar atualização
    throw new NotImplementedException();
  }

  remove(_id: string, _companyId: string): Promise<void> {
    // TODO: orquestrar remoção (soft delete se aplicável)
    throw new NotImplementedException();
  }
}
