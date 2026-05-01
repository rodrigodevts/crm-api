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
import { <%= classify(name) %>ApplicationService } from '../services/<%= dasherize(name) %>.application.service';
import { Create<%= classify(name) %>Dto } from '../schemas/create-<%= dasherize(name) %>.schema';
import { Update<%= classify(name) %>Dto } from '../schemas/update-<%= dasherize(name) %>.schema';
import { <%= classify(name) %>ResponseDto } from '../schemas/<%= dasherize(name) %>-response.schema';

@ApiTags('<%= dasherize(name) %>')
@Controller('<%= dasherize(name) %>')
export class <%= classify(name) %>Controller {
  constructor(private readonly applicationService: <%= classify(name) %>ApplicationService) {}

  @Get()
  @ZodSerializerDto(<%= classify(name) %>ResponseDto)
  async list(): Promise<<%= classify(name) %>ResponseDto[]> {
    // TODO: extrair @CurrentCompany, paginar (cursor-based per api-conventions.md), chamar applicationService.list
    throw new NotImplementedException();
  }

  @Get(':id')
  @ZodSerializerDto(<%= classify(name) %>ResponseDto)
  async getById(@Param('id') _id: string): Promise<<%= classify(name) %>ResponseDto> {
    // TODO: implementar
    throw new NotImplementedException();
  }

  @Post()
  @ZodSerializerDto(<%= classify(name) %>ResponseDto)
  async create(@Body() _input: Create<%= classify(name) %>Dto): Promise<<%= classify(name) %>ResponseDto> {
    // TODO: implementar
    throw new NotImplementedException();
  }

  @Patch(':id')
  @ZodSerializerDto(<%= classify(name) %>ResponseDto)
  async update(
    @Param('id') _id: string,
    @Body() _input: Update<%= classify(name) %>Dto,
  ): Promise<<%= classify(name) %>ResponseDto> {
    // TODO: implementar
    throw new NotImplementedException();
  }

  @Delete(':id')
  async remove(@Param('id') _id: string): Promise<void> {
    // TODO: implementar
    throw new NotImplementedException();
  }
}
