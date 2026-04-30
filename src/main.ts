import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { Logger } from 'nestjs-pino';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ genReqId: () => crypto.randomUUID() }),
    { bufferLogs: true },
  );

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });

  const openApiConfig = new DocumentBuilder()
    .setTitle('DigiChat API')
    .setDescription('CRM omnichannel WhatsApp multi-tenant — REST API')
    .setVersion('0.0.1')
    .addBearerAuth()
    .build();

  const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, openApiConfig));

  SwaggerModule.setup('api/v1/openapi', app, document, {
    jsonDocumentUrl: 'api/v1/openapi.json',
    yamlDocumentUrl: 'api/v1/openapi.yaml',
    swaggerUiEnabled: false,
  });

  app.use(
    '/api/v1/docs',
    apiReference({
      content: document,
      theme: 'purple',
      withFastify: true,
    }),
  );

  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: '0.0.0.0' });

  const logger = app.get(Logger);
  logger.log(`API listening on http://localhost:${port}`, 'Bootstrap');
  logger.log(`Health: http://localhost:${port}/health`, 'Bootstrap');
  logger.log(`Docs:   http://localhost:${port}/api/v1/docs`, 'Bootstrap');
  logger.log(`Spec:   http://localhost:${port}/api/v1/openapi.json`, 'Bootstrap');
}

void bootstrap();
