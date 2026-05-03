import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { UsersDomainService } from '../../users/services/users.domain.service';
import { CompaniesDomainService } from './companies.domain.service';

@Injectable()
export class CompaniesApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companiesDomain: CompaniesDomainService,
    private readonly usersDomain: UsersDomainService,
  ) {}
}
