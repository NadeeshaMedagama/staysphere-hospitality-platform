#!/usr/bin/env node
/**
 * Scaffolds a StaySphere microservice.
 *
 *   node scripts/new-service.mjs <name> --port <port> [--no-db]
 *
 * Generates only the parts that are identical across every service — manifest,
 * tsconfig, lint and test config, env schema, bootstrap and app module. Domain
 * logic, the Prisma schema and the HTTP surface are written by hand afterwards,
 * because those are the parts that should differ.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const [, , rawName, ...rest] = process.argv;

if (!rawName) {
  console.error('usage: node scripts/new-service.mjs <name> --port <port> [--no-db]');
  process.exit(1);
}

const name = rawName.endsWith('-service') || rawName === 'api-gateway' ? rawName : `${rawName}-service`;
const portIndex = rest.indexOf('--port');
const port = portIndex >= 0 ? Number(rest[portIndex + 1]) : 3000;
const withDb = !rest.includes('--no-db');

const root = join(process.cwd(), 'services', name);
if (existsSync(root)) {
  console.error(`services/${name} already exists`);
  process.exit(1);
}

/** camelCase identifier used for the env loader, e.g. `loadHousekeepingEnv`. */
const camel = name
  .replace(/-service$/, '')
  .split('-')
  .map((part, index) => (index === 0 ? part : part[0].toUpperCase() + part.slice(1)))
  .join('');
const pascal = camel[0].toUpperCase() + camel.slice(1);
const title = name
  .split('-')
  .map((part) => part[0].toUpperCase() + part.slice(1))
  .join(' ');

const write = (relative, contents) => {
  const path = join(root, relative);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, contents);
};

/* ------------------------------------------------------------------ manifest */
const scripts = {
  build: 'nest build',
  dev: 'nest start --watch',
  start: 'node dist/main.js',
  clean: 'rimraf dist .turbo coverage',
  lint: 'eslint src',
  typecheck: 'tsc --noEmit -p tsconfig.json',
  test: 'jest --passWithNoTests',
  'test:cov': 'jest --coverage --passWithNoTests',
  'test:e2e': 'jest --config test/jest-e2e.json --passWithNoTests',
  ...(withDb
    ? {
        'db:generate': 'prisma generate',
        'db:migrate': 'prisma migrate deploy',
        'db:migrate:dev': 'prisma migrate dev',
      }
    : {}),
};

write(
  'package.json',
  `${JSON.stringify(
    {
      name: `@staysphere/${name}`,
      version: '1.0.0',
      private: true,
      description: `StaySphere ${title}.`,
      license: 'MIT',
      main: 'dist/main.js',
      scripts,
      dependencies: {
        '@nestjs/common': '^10.4.15',
        '@nestjs/config': '^3.3.0',
        '@nestjs/core': '^10.4.15',
        '@nestjs/platform-express': '^10.4.15',
        '@nestjs/swagger': '^8.1.0',
        '@nestjs/throttler': '^6.3.0',
        ...(withDb ? { '@prisma/client': '^6.2.1' } : {}),
        '@staysphere/contracts': 'workspace:*',
        '@staysphere/service-core': 'workspace:*',
        helmet: '^8.0.0',
        kafkajs: '^2.2.4',
        nanoid: '^3.3.8',
        'nestjs-pino': '^4.2.0',
        pino: '^9.6.0',
        'pino-http': '^10.4.0',
        'prom-client': '^15.1.3',
        'reflect-metadata': '^0.2.2',
        rxjs: '^7.8.1',
        zod: '^3.24.1',
      },
      devDependencies: {
        '@nestjs/cli': '^10.4.9',
        '@nestjs/schematics': '^10.2.3',
        '@nestjs/testing': '^10.4.15',
        '@staysphere/eslint-config': 'workspace:*',
        '@staysphere/typescript-config': 'workspace:*',
        '@types/express': '^5.0.0',
        '@types/jest': '^29.5.14',
        '@types/node': '^22.10.5',
        '@types/supertest': '^6.0.2',
        eslint: '^9.17.0',
        jest: '^29.7.0',
        'pino-pretty': '^13.0.0',
        ...(withDb ? { prisma: '^6.2.1' } : {}),
        rimraf: '^6.0.1',
        supertest: '^7.0.0',
        'ts-jest': '^29.2.5',
        typescript: '^5.7.3',
      },
    },
    null,
    2,
  )}\n`,
);

/* ------------------------------------------------------------------- configs */
write(
  'tsconfig.json',
  `${JSON.stringify(
    {
      extends: '@staysphere/typescript-config/nestjs.json',
      compilerOptions: { outDir: './dist', rootDir: './src' },
      include: ['src/**/*.ts'],
      exclude: ['node_modules', 'dist', 'test'],
    },
    null,
    2,
  )}\n`,
);

write(
  'nest-cli.json',
  `${JSON.stringify(
    {
      $schema: 'https://json.schemastore.org/nest-cli',
      collection: '@nestjs/schematics',
      sourceRoot: 'src',
      compilerOptions: {
        deleteOutDir: true,
        // The generated Prisma client is emitted JavaScript, so tsc neither
        // compiles nor copies it into dist. Without this, the built service
        // fails at require time while the build and tests both pass.
        ...(withDb
          ? {
              assets: [{ include: 'generated/**/*', outDir: 'dist' }],
              watchAssets: true,
            }
          : {}),
      },
    },
    null,
    2,
  )}\n`,
);

write('eslint.config.mjs', "import config from '@staysphere/eslint-config/nestjs';\nexport default config;\n");

write(
  'jest.config.cjs',
  `/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\\\.spec\\\\.ts$',
  transform: { '^.+\\\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }] },
  collectCoverageFrom: ['**/*.ts', '!**/*.module.ts', '!**/main.ts', '!**/*.spec.ts'],
  coverageDirectory: '../coverage',
  moduleNameMapper: { '^(\\\\.{1,2}/.*)\\\\.js$': '$1' },
};
`,
);

write(
  'test/jest-e2e.json',
  `${JSON.stringify(
    {
      moduleFileExtensions: ['js', 'json', 'ts'],
      rootDir: '.',
      testEnvironment: 'node',
      testRegex: '.e2e-spec.ts$',
      transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }] },
    },
    null,
    2,
  )}\n`,
);

/* ----------------------------------------------------------------- env schema */
write(
  'src/config/env.ts',
  `import { baseEnvSchema${withDb ? ', databaseEnvSchema' : ''}, validateEnv } from '@staysphere/service-core';
import { z } from 'zod';

export const ${camel}EnvSchema = baseEnvSchema${withDb ? '.merge(databaseEnvSchema)' : ''}.extend({
  SERVICE_NAME: z.string().default('${name}'),
  PORT: z.coerce.number().int().default(${port}),

  /** Verifies access tokens minted by auth-service. */
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().default('staysphere.auth'),
  JWT_AUDIENCE: z.string().default('staysphere.api'),
});

export type ${pascal}Env = z.infer<typeof ${camel}EnvSchema>;

export function load${pascal}Env(source: NodeJS.ProcessEnv = process.env): ${pascal}Env {
  return validateEnv(${camel}EnvSchema, source);
}
`,
);

/* -------------------------------------------------------------- prisma client */
if (withDb) {
  write(
    'src/prisma/prisma.service.ts',
    `import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/index.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to the ${name} datastore');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async ping(): Promise<void> {
    await this.$queryRaw\`SELECT 1\`;
  }
}
`,
  );
}

/* ----------------------------------------------------------------- bootstrap */
write(
  'src/main.ts',
  `import 'reflect-metadata';
import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { parseCorsOrigins } from '@staysphere/service-core';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { load${pascal}Env } from './config/env.js';

async function bootstrap(): Promise<void> {
  const env = load${pascal}Env();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.use(helmet({ contentSecurityPolicy: env.NODE_ENV === 'production' }));
  app.enableCors({
    origin: parseCorsOrigins(env.CORS_ORIGINS),
    credentials: true,
    exposedHeaders: ['x-request-id', 'x-correlation-id'],
  });

  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1', prefix: 'v' });

  if (env.NODE_ENV !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('StaySphere — ${title}')
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
`,
);

console.log(`✓ scaffolded services/${name} (port ${port}${withDb ? '' : ', no database'})`);
console.log('  next: write prisma/schema.prisma, the domain modules and app.module.ts');
