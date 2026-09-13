#!/usr/bin/env node
/**
 * Structural checks that unit tests and type checking cannot express.
 *
 * Each one exists because its absence produced a real failure that every other
 * gate passed cleanly:
 *
 *   • A service without AuthorizationGuard makes @RequireRoles and
 *     @RequirePermissions inert — the decorators write metadata nothing reads,
 *     and every protected route is reachable by any authenticated caller.
 *   • A service without ForwardedPrincipalMiddleware never sees the principal
 *     the gateway verified, so every authenticated route fails closed instead.
 *   • A type-only import of an injected class erases the runtime reference
 *     `emitDecoratorMetadata` needs, and Nest fails at boot with
 *     "argument Function at index [0]".
 *   • A service with a Prisma schema whose nest-cli config does not copy
 *     src/generated into dist ships a build that cannot require its own client.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const SERVICES_DIR = 'services';
// The gateway guards at the edge and holds no domain routes; auth-service
// registers its own authentication/authorisation pair inside AuthModule.
const NO_GLOBAL_GUARD = new Set(['api-gateway', 'auth-service']);
const NO_FORWARDED_PRINCIPAL = new Set(['api-gateway']);

const INJECTABLE = /^(?:[A-Z][A-Za-z0-9]*(?:Service|Guard|Registry|Gateway|Interceptor|Filter|Strategy)|Reflector|JwtService|PrismaService|HttpService)$/;

const failures = [];
const fail = (service, message) => failures.push(`${service}: ${message}`);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'generated' || entry.name === 'node_modules') continue;
      out.push(...walk(path));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      out.push(path);
    }
  }
  return out;
}

for (const service of readdirSync(SERVICES_DIR)) {
  const root = join(SERVICES_DIR, service);
  const appModule = join(root, 'src/app.module.ts');
  if (!existsSync(appModule)) continue;
  const module = readFileSync(appModule, 'utf8');

  // Match the registration, not the identifier: an import left behind after
  // the provider is deleted would otherwise satisfy the check.
  const registersGuard = /useClass:\s*AuthorizationGuard/.test(module);
  if (!NO_GLOBAL_GUARD.has(service) && !registersGuard) {
    fail(service, 'app.module.ts does not register AuthorizationGuard — every @RequireRoles and @RequirePermissions on this service is inert');
  }

  const appliesPrincipal = /consumer\s*\.apply\([^)]*ForwardedPrincipalMiddleware/.test(module);
  if (!NO_FORWARDED_PRINCIPAL.has(service) && !appliesPrincipal) {
    fail(service, 'app.module.ts does not apply ForwardedPrincipalMiddleware — the gateway forwards a principal that nothing reads');
  }

  if (existsSync(join(root, 'prisma/schema.prisma'))) {
    const nestCli = JSON.parse(readFileSync(join(root, 'nest-cli.json'), 'utf8'));
    const assets = nestCli.compilerOptions?.assets ?? [];
    const copiesClient = assets.some((a) => String(a.include ?? a).includes('generated'));
    if (!copiesClient) {
      fail(service, 'nest-cli.json does not copy src/generated into dist — the built service cannot require its own Prisma client');
    }
  }

  for (const file of walk(join(root, 'src'))) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\{([^{}]*\btype\s+[A-Z][^{}]*)\}/g)) {
      for (const part of match[1].split(',').map((p) => p.trim())) {
        if (!part.startsWith('type ')) continue;
        const name = part.slice(5).trim();
        if (INJECTABLE.test(name)) {
          fail(service, `${file} imports ${name} as a type — that erases the reference emitDecoratorMetadata needs`);
        }
      }
    }
  }
}

// The generator scripts are only run when someone adds a service, so a syntax
// error in one can sit undetected for months and then greet a new contributor.
for (const script of readdirSync('scripts').filter((f) => f.endsWith('.mjs'))) {
  try {
    execFileSync(process.execPath, ['--check', join('scripts', script)], { stdio: 'pipe' });
  } catch (error) {
    const detail = String(error.stderr ?? '').split('\n').find((l) => l.includes('Error')) ?? '';
    fail('scripts', `${script} does not parse — ${detail.trim()}`);
  }
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} service wiring problem(s):\n`);
  for (const failure of failures) console.error(`  • ${failure}`);
  process.exit(1);
}

console.log('✓ Every service is wired correctly.');
