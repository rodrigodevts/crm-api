import {
  Body,
  Controller,
  Delete,
  Get,
  NotImplementedException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import { CompaniesApplicationService } from '../services/companies.application.service';
import { CreateCompaniesDto } from '../schemas/create-companies.schema';
import { UpdateCompaniesDto } from '../schemas/update-companies.schema';
import { CompaniesResponseDto } from '../schemas/companies-response.schema';

@ApiTags('companies')
@Controller('companies')
export class CompaniesController {
  constructor(private readonly applicationService: CompaniesApplicationService) {}

  @Get()
  @ZodSerializerDto(CompaniesResponseDto)
  list(): Promise<CompaniesResponseDto[]> {
    // TODO: extrair @CurrentCompany, paginar (cursor-based per api-conventions.md), chamar applicationService.list
    throw new NotImplementedException();
  }

  @Get(':id')
  @ZodSerializerDto(CompaniesResponseDto)
  getById(@Param('id') _id: string): Promise<CompaniesResponseDto> {
    // TODO: implementar
    throw new NotImplementedException();
  }

  @Post()
  @ZodSerializerDto(CompaniesResponseDto)
  create(@Body() _input: CreateCompaniesDto): Promise<CompaniesResponseDto> {
    // TODO: implementar
    throw new NotImplementedException();
  }

  @Patch(':id')
  @ZodSerializerDto(CompaniesResponseDto)
  update(
    @Param('id') _id: string,
    @Body() _input: UpdateCompaniesDto,
  ): Promise<CompaniesResponseDto> {
    // TODO: implementar
    throw new NotImplementedException();
  }

  @Delete(':id')
  remove(@Param('id') _id: string): Promise<void> {
    // TODO: implementar
    throw new NotImplementedException();
  }
}
