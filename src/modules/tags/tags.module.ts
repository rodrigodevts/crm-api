import { Module } from '@nestjs/common';
import { TagsController } from './controllers/tags.controller';
import { TagsApplicationService } from './services/tags.application.service';
import { TagsDomainService } from './services/tags.domain.service';

@Module({
  controllers: [TagsController],
  providers: [TagsApplicationService, TagsDomainService],
  exports: [TagsApplicationService],
})
export class TagsModule {}
