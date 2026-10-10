import { defineConfig } from 'tsup';

/**
 * Dual ESM + CJS output. The Next.js apps consume this package as ESM while the
 * NestJS services compile to CommonJS, so a single-format build would break one
 * side or the other at runtime.
 */
export default defineConfig((options) => ({
  entry: {
    index: 'src/index.ts',
    'domain/index': 'src/domain/index.ts',
    'events/index': 'src/events/index.ts',
    'errors/index': 'src/errors/index.ts',
    'http/index': 'src/http/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  // Cleaning on every watch restart deletes the .d.ts files the service
  // compilers are reading, and whichever service is mid-compile fails with
  // TS7016. Only a one-shot build clears the directory.
  clean: !options.watch,
  treeshake: true,
  splitting: false,
  target: 'es2022',
  outDir: 'dist',
}));
