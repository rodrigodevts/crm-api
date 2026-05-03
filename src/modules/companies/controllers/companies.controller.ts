import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import { Roles } from '../../../common/decorators/roles.decorator';
import {
  CompanyListResponseDto,
  CompanyListResponseSchema,
} from '../schemas/company-response.schema';
import {
  CompanyWithAdminResponseDto,
  CompanyWithAdminResponseSchema,
} from '../schemas/company-with-admin-response.schema';
import { CreateCompanyDto } from '../schemas/create-company.schema';
import { ListCompaniesQueryDto } from '../schemas/list-companies.schema';
import { CompaniesApplicationService } from '../services/companies.application.service';

@ApiTags('companies')
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesApplicationService) {}

  @Post()
  @Roles('SUPER_ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ZodSerializerDto(CompanyWithAdminResponseSchema)
  async create(@Body() body: CreateCompanyDto): Promise<CompanyWithAdminResponseDto> {
    return this.companies.create(body);
  }

  @Get()
  @Roles('SUPER_ADMIN')
  @ZodSerializerDto(CompanyListResponseSchema)
  async list(@Query() query: ListCompaniesQueryDto): Promise<CompanyListResponseDto> {
    return this.companies.list(query);
  }
}
