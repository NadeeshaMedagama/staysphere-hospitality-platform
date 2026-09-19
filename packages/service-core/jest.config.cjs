/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }] },
  collectCoverageFrom: ['**/*.ts', '!**/index.ts', '!**/*.spec.ts'],
  coverageDirectory: '../coverage',
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
};
