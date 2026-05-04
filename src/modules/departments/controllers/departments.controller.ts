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
import { CreateDepartmentDtoClass } from '../schemas/create-department.schema';
import { UpdateDepartmentDtoClass } from '../schemas/update-department.schema';
import {
  ListDepartmentsQuerySchema,
  type ListDepartmentsQueryDto,
} from '../schemas/list-departments.schema';
import {
  DepartmentListResponseDtoClass,
  DepartmentResponseDtoClass,
} from '../schemas/department-response.schema';
import { DepartmentDetailResponseDtoClass } from '../schemas/department-detail-response.schema';
import { DepartmentsApplicationService } from '../services/departments.application.service';

@ApiTags('departments')
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly app: DepartmentsApplicationService) {}

  @Post()
  @Roles('ADMIN')
  @ZodSerializerDto(DepartmentResponseDtoClass)
  async create(@Body() body: CreateDepartmentDtoClass, @CurrentCompany() companyId: string) {
    return this.app.create(body, companyId);
  }

  @Get()
  @ZodSerializerDto(DepartmentListResponseDtoClass)
  async list(@Query() rawQuery: Record<string, string>, @CurrentCompany() companyId: string) {
    const query: ListDepartmentsQueryDto = ListDepartmentsQuerySchema.parse(rawQuery);
    return this.app.list(companyId, query);
  }

  @Get(':id')
  @ZodSerializerDto(DepartmentDetailResponseDtoClass)
  async findById(@Param('id', ParseUUIDPipe) id: string, @CurrentCompany() companyId: string) {
    return this.app.findById(id, companyId);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ZodSerializerDto(DepartmentResponseDtoClass)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateDepartmentDtoClass,
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
