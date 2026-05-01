import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
// import { MeController } from './controllers/me.controller';  // Task 21
import { UsersController } from './controllers/users.controller';
import { UsersApplicationService } from './services/users.application.service';
import { UsersDomainService } from './services/users.domain.service';

@Module({
  imports: [AuthModule],
  controllers: [UsersController /*, MeController*/],
  providers: [UsersApplicationService, UsersDomainService],
  exports: [UsersApplicationService, UsersDomainService],
})
export class UsersModule {}
