import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentCompany } from '@/common/decorators/current-company.decorator';
import { CreateDepartmentDto } from '../schemas/create-department.schema';
import { UpdateDepartmentDto } from '../schemas/update-department.schema';
import { ListDepartmentsQueryDto } from '../schemas/list-departments.schema';
import {
  DepartmentListResponseDto,
  DepartmentResponseDto,
} from '../schemas/department-response.schema';
import { DepartmentDetailResponseDto } from '../schemas/department-detail-response.schema';
import { DepartmentsApplicationService } from '../services/departments.application.service';

@ApiTags('departments')
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly app: DepartmentsApplicationService) {}

  @Post()
  @Roles('ADMIN')
  @ZodSerializerDto(DepartmentResponseDto)
  async create(@Body() body: CreateDepartmentDto, @CurrentCompany() companyId: string) {
    return this.app.create(body, companyId);
  }

  @Get()
  @ZodSerializerDto(DepartmentListResponseDto)
  async list(@Query() query: ListDepartmentsQueryDto, @CurrentCompany() companyId: string) {
    return this.app.list(companyId, query);
  }

  @Get(':id')
  @ZodSerializerDto(DepartmentDetailResponseDto)
  async findById(@Param('id', ParseUUIDPipe) id: string, @CurrentCompany() companyId: string) {
    return this.app.findById(id, companyId);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ZodSerializerDto(DepartmentResponseDto)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateDepartmentDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.app.update(id, companyId, body);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(204)
  async softDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentCompany() companyId: string,
  ): Promise<void> {
    await this.app.softDelete(id, companyId);
  }
}
