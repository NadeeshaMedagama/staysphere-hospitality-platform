/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }] },
  collectCoverageFrom: ['**/*.ts', '!**/*.module.ts', '!**/main.ts', '!**/*.spec.ts'],
  coverageDirectory: '../coverage',
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  coverageThreshold: { global: { statements: 60, branches: 50, functions: 55, lines: 60 } },
};
