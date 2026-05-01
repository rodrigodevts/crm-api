import { Module } from '@nestjs/common';
import { UsersController } from './controllers/users.controller';
import { UsersApplicationService } from './services/users.application.service';
import { UsersDomainService } from './services/users.domain.service';

@Module({
  controllers: [UsersController],
  providers: [UsersApplicationService, UsersDomainService],
  exports: [UsersApplicationService],
})
export class UsersModule {}
