import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { CompaniesController } from './controllers/companies.controller';
import { CompaniesMeController } from './controllers/companies-me.controller';
import { CompaniesApplicationService } from './services/companies.application.service';
import { CompaniesDomainService } from './services/companies.domain.service';

@Module({
  imports: [AuthModule, UsersModule],
  // CompaniesMeController declarado ANTES — Fastify resolve rotas pela ordem
  // de registro: precisamos de /me antes de /:id em GET.
  controllers: [CompaniesMeController, CompaniesController],
  providers: [CompaniesApplicationService, CompaniesDomainService],
  exports: [CompaniesApplicationService, CompaniesDomainService],
})
export class CompaniesModule {}
