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
  getById(@Param('id') _id: string): Promise<UserResponseDto> {
    // TODO: implementar
    throw new Error('Not implemented');
  }

  @Patch(':id')
  @ZodSerializerDto(UserResponseDto)
  update(@Param('id') _id: string, @Body() _input: UpdateUserDto): Promise<UserResponseDto> {
    // TODO: implementar
    throw new Error('Not implemented');
  }

  @Delete(':id')
  remove(@Param('id') _id: string): Promise<void> {
    // TODO: implementar
    throw new Error('Not implemented');
  }
}
