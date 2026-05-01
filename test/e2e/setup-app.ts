import { Test, type TestingModule } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../../src/app.module';

export async function bootstrapTestApp(): Promise<NestFastifyApplication> {
  process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-32-chars-minimum-aaa';
  process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-32-chars-minimum-aaa';
  process.env.CHANNEL_CONFIG_ENCRYPTION_KEY ??=
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.S3_ENDPOINT ??= 'http://localhost:9000';
  process.env.S3_ACCESS_KEY ??= 'minioadmin';
  process.env.S3_SECRET_KEY ??= 'minioadmin';
  process.env.S3_BUCKET ??= 'test';
  process.env.REDIS_URL ??= 'redis://localhost:6379';
  process.env.LOG_LEVEL = 'silent';

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
