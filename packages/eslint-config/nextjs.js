import base from './base.js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/** ESLint configuration for Next.js applications. */
export default tseslint.config(...base, {
  files: ['**/*.{ts,tsx}'],
  languageOptions: {
    globals: { ...globals.browser, ...globals.node },
  },
  rules: {
    'no-console': ['error', { allow: ['warn', 'error'] }],
  },
});
