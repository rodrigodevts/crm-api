import { Module } from '@nestjs/common';
import { <%= classify(name) %>Controller } from './controllers/<%= dasherize(name) %>.controller';
import { <%= classify(name) %>ApplicationService } from './services/<%= dasherize(name) %>.application.service';
import { <%= classify(name) %>DomainService } from './services/<%= dasherize(name) %>.domain.service';

@Module({
  controllers: [<%= classify(name) %>Controller],
  providers: [<%= classify(name) %>ApplicationService, <%= classify(name) %>DomainService],
  exports: [<%= classify(name) %>ApplicationService],
})
export class <%= classify(name) %>Module {}
