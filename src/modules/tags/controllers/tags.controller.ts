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
import type { User } from '@prisma/client';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentCompany } from '@/common/decorators/current-company.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { CreateTagDto } from '../schemas/create-tag.schema';
import { UpdateTagDto } from '../schemas/update-tag.schema';
import { ListTagsQueryDto } from '../schemas/list-tags.schema';
import { DeleteTagQueryDto } from '../schemas/delete-tag.schema';
import { TagListResponseDto, TagResponseDto } from '../schemas/tag-response.schema';
import { TagsApplicationService } from '../services/tags.application.service';

@ApiTags('tags')
@Controller('tags')
export class TagsController {
  constructor(private readonly app: TagsApplicationService) {}

  @Post()
  @Roles('SUPERVISOR')
  @ZodSerializerDto(TagResponseDto)
  async create(@Body() body: CreateTagDto, @CurrentCompany() companyId: string) {
    return this.app.create(body, companyId);
  }

  @Get()
  @ZodSerializerDto(TagListResponseDto)
  async list(@Query() query: ListTagsQueryDto, @CurrentCompany() companyId: string) {
    return this.app.list(companyId, query);
  }

  @Get(':id')
  @ZodSerializerDto(TagResponseDto)
  async findById(@Param('id', ParseUUIDPipe) id: string, @CurrentCompany() companyId: string) {
    return this.app.findById(id, companyId);
  }

  @Patch(':id')
  @Roles('SUPERVISOR')
  @ZodSerializerDto(TagResponseDto)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateTagDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.app.update(id, companyId, body);
  }

  @Delete(':id')
  @Roles('SUPERVISOR')
  @HttpCode(204)
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: DeleteTagQueryDto,
    @CurrentUser() user: User,
    @CurrentCompany() companyId: string,
  ): Promise<void> {
    await this.app.delete(id, companyId, user, query);
  }
}
