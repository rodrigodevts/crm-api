import { Module } from '@nestjs/common';
import { DepartmentsController } from './controllers/departments.controller';
import { DepartmentsApplicationService } from './services/departments.application.service';
import { DepartmentsDomainService } from './services/departments.domain.service';

@Module({
  controllers: [DepartmentsController],
  providers: [DepartmentsApplicationService, DepartmentsDomainService],
  exports: [DepartmentsApplicationService],
})
export class DepartmentsModule {}
