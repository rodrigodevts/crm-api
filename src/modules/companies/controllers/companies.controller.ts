import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CompaniesApplicationService } from '../services/companies.application.service';

@ApiTags('companies')
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesApplicationService) {}
}
