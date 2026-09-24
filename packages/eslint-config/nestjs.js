import base from './base.js';
import tseslint from 'typescript-eslint';

/** ESLint configuration for NestJS microservices. */
export default tseslint.config(...base, {
  files: ['**/*.ts'],
  rules: {
    // Nest relies heavily on decorators and DI-injected classes.
    '@typescript-eslint/no-extraneous-class': 'off',
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-empty-object-type': 'off',

    // Deliberately OFF for services, and its autofix is why.
    //
    // A constructor parameter is a type position syntactically, so the rule
    // rewrites `import { ProxyService }` to `import type { ProxyService }`.
    // That erases the import at compile time, `emitDecoratorMetadata` then
    // emits `Function` instead of the class, and Nest fails at runtime with
    // "can't resolve dependencies … argument Function at index [0]".
    //
    // Nothing catches it earlier: the build succeeds and the unit tests pass,
    // because the break only exists in the emitted decorator metadata.
    // typescript-eslint documents the incompatibility; the only safe setting
    // alongside emitDecoratorMetadata is off.
    '@typescript-eslint/consistent-type-imports': 'off',
  },
});
