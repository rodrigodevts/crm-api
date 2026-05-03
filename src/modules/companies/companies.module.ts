import { Module } from '@nestjs/common';
import { CompaniesController } from './controllers/companies.controller';
import { CompaniesApplicationService } from './services/companies.application.service';
import { CompaniesDomainService } from './services/companies.domain.service';

@Module({
  controllers: [CompaniesController],
  providers: [CompaniesApplicationService, CompaniesDomainService],
  exports: [CompaniesApplicationService],
})
export class CompaniesModule {}
