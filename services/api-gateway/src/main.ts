import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { parseCorsOrigins } from '@staysphere/service-core';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { loadGatewayEnv } from './config/env.js';

async function bootstrap(): Promise<void> {
  const env = loadGatewayEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.use(helmet({ contentSecurityPolicy: env.NODE_ENV === 'production' }));
  app.enableCors({
    origin: parseCorsOrigins(env.CORS_ORIGINS),
    credentials: true,
    exposedHeaders: ['x-request-id', 'x-correlation-id'],
  });

  if (env.NODE_ENV !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('StaySphere — API Gateway')
        .setDescription('Single ingress for every StaySphere service.')
        .setVersion(env.SERVICE_VERSION)
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('docs', app, document);
  }

  app.enableShutdownHooks();
  await app.listen(env.PORT, '0.0.0.0');
}

void bootstrap();
