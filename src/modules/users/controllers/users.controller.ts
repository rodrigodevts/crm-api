import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import { CurrentCompany } from '../../../common/decorators/current-company.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CreateUserDto } from '../schemas/create-user.schema';
import { ListUsersQueryDto } from '../schemas/list-users.schema';
import { UpdateUserDto } from '../schemas/update-user.schema';
import {
  UserListResponseDto,
  UserListResponseSchema,
  UserResponseDto,
} from '../schemas/user-response.schema';
import { UsersApplicationService } from '../services/users.application.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersApplicationService) {}

  @Post()
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ZodSerializerDto(UserResponseDto)
  async create(
    @Body() body: CreateUserDto,
    @CurrentCompany() companyId: string,
  ): Promise<UserResponseDto> {
    return this.users.create(body, companyId);
  }

  @Get()
  @ZodSerializerDto(UserListResponseSchema)
  async list(
    @Query() query: ListUsersQueryDto,
    @CurrentCompany() companyId: string,
  ): Promise<UserListResponseDto> {
    return this.users.list(companyId, query);
  }

  @Get(':id')
  @ZodSerializerDto(UserResponseDto)
  async findById(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
  ): Promise<UserResponseDto> {
    return this.users.findById(id, companyId);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ZodSerializerDto(UserResponseDto)
  async update(
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
    @CurrentCompany() companyId: string,
  ): Promise<UserResponseDto> {
    return this.users.updateById(id, companyId, body);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @CurrentCompany() companyId: string): Promise<void> {
    await this.users.softDelete(id, companyId);
  }
}
