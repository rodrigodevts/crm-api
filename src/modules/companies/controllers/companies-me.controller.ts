import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CompanyResponseDto, CompanyResponseSchema } from '../schemas/company-response.schema';
import { CompaniesApplicationService } from '../services/companies.application.service';

@ApiTags('companies')
@Controller('companies/me')
export class CompaniesMeController {
  constructor(private readonly companies: CompaniesApplicationService) {}

  @Get()
  @ZodSerializerDto(CompanyResponseSchema)
  async findMine(@CurrentUser() currentUser: User): Promise<CompanyResponseDto> {
    return this.companies.findMine(currentUser);
  }
}
