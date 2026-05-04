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
import { DepartmentsApplicationService } from '../services/departments.application.service';
import { CreateDepartmentsDto } from '../schemas/create-department.schema';
import { UpdateDepartmentsDto } from '../schemas/update-department.schema';
import { DepartmentsResponseDto } from '../schemas/department-response.schema';

@ApiTags('departments')
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly applicationService: DepartmentsApplicationService) {}

  @Get()
  @ZodSerializerDto(DepartmentsResponseDto)
  list(): Promise<DepartmentsResponseDto[]> {
    // TODO: extrair @CurrentCompany, paginar (cursor-based per api-conventions.md), chamar applicationService.list
    throw new NotImplementedException();
  }

  @Get(':id')
  @ZodSerializerDto(DepartmentsResponseDto)
  getById(@Param('id') _id: string): Promise<DepartmentsResponseDto> {
    // TODO: implementar
    throw new NotImplementedException();
  }

  @Post()
  @ZodSerializerDto(DepartmentsResponseDto)
  create(@Body() _input: CreateDepartmentsDto): Promise<DepartmentsResponseDto> {
    // TODO: implementar
    throw new NotImplementedException();
  }

  @Patch(':id')
  @ZodSerializerDto(DepartmentsResponseDto)
  update(
    @Param('id') _id: string,
    @Body() _input: UpdateDepartmentsDto,
  ): Promise<DepartmentsResponseDto> {
    // TODO: implementar
    throw new NotImplementedException();
  }

  @Delete(':id')
  remove(@Param('id') _id: string): Promise<void> {
    // TODO: implementar
    throw new NotImplementedException();
  }
}
