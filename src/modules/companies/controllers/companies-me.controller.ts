import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CompanyResponseDto, CompanyResponseSchema } from '../schemas/company-response.schema';
import { UpdateCompanyMeDto } from '../schemas/update-company-me.schema';
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

  @Patch()
  @Roles('ADMIN')
  @ZodSerializerDto(CompanyResponseSchema)
  async updateMine(
    @CurrentUser() currentUser: User,
    @Body() body: UpdateCompanyMeDto,
  ): Promise<CompanyResponseDto> {
    return this.companies.updateMine(currentUser, body);
  }
}
