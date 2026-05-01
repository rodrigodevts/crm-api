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
import { UsersApplicationService } from '../services/users.application.service';
import { CreateUserDto } from '../schemas/create-user.schema';
import { UpdateUserDto } from '../schemas/update-user.schema';
import { UserResponseDto } from '../schemas/user-response.schema';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly applicationService: UsersApplicationService) {}

  @Get()
  @ZodSerializerDto(UserResponseDto)
  list(): Promise<UserResponseDto[]> {
    // TODO: extrair @CurrentCompany, paginar (cursor-based per api-conventions.md), chamar applicationService.list
    throw new NotImplementedException();
  }

  @Get(':id')
  @ZodSerializerDto(UserResponseDto)
  getById(@Param('id') _id: string): Promise<UserResponseDto> {
    // TODO: implementar
    throw new NotImplementedException();
  }

  @Post()
  @ZodSerializerDto(UserResponseDto)
  create(@Body() _input: CreateUserDto): Promise<UserResponseDto> {
    // TODO: implementar
    throw new NotImplementedException();
  }

  @Patch(':id')
  @ZodSerializerDto(UserResponseDto)
  update(@Param('id') _id: string, @Body() _input: UpdateUserDto): Promise<UserResponseDto> {
    // TODO: implementar
    throw new NotImplementedException();
  }

  @Delete(':id')
  remove(@Param('id') _id: string): Promise<void> {
    // TODO: implementar
    throw new NotImplementedException();
  }
}
