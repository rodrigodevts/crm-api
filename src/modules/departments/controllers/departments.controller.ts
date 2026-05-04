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
import { CreateDepartmentDtoClass } from '../schemas/create-department.schema';
import { UpdateDepartmentDtoClass } from '../schemas/update-department.schema';
import { DepartmentResponseDtoClass } from '../schemas/department-response.schema';

@ApiTags('departments')
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly applicationService: DepartmentsApplicationService) {}

  @Get()
  @ZodSerializerDto(DepartmentResponseDtoClass)
  list(): Promise<DepartmentResponseDtoClass[]> {
    // TODO: extrair @CurrentCompany, paginar (cursor-based per api-conventions.md), chamar applicationService.list
    throw new NotImplementedException();
  }

  @Get(':id')
  @ZodSerializerDto(DepartmentResponseDtoClass)
  getById(@Param('id') _id: string): Promise<DepartmentResponseDtoClass> {
    // TODO: implementar
    throw new NotImplementedException();
  }

  @Post()
  @ZodSerializerDto(DepartmentResponseDtoClass)
  create(@Body() _input: CreateDepartmentDtoClass): Promise<DepartmentResponseDtoClass> {
    // TODO: implementar
    throw new NotImplementedException();
  }

  @Patch(':id')
  @ZodSerializerDto(DepartmentResponseDtoClass)
  update(
    @Param('id') _id: string,
    @Body() _input: UpdateDepartmentDtoClass,
  ): Promise<DepartmentResponseDtoClass> {
    // TODO: implementar
    throw new NotImplementedException();
  }

  @Delete(':id')
  remove(@Param('id') _id: string): Promise<void> {
    // TODO: implementar
    throw new NotImplementedException();
  }
}
