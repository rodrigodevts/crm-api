import './env-setup';
import { Test, type TestingModule } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../../src/app.module';

export async function bootstrapTestApp(): Promise<NestFastifyApplication> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
