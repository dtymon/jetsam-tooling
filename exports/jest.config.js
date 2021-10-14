module.exports = {
  collectCoverage: true,
  coverageDirectory: 'test/reports',
  coverageReporters: ['cobertura', 'html', 'text'],
  moduleDirectories: ['node_modules', 'src'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  modulePaths: ['<rootDir>/src/lib/'],
  preset: 'ts-jest',
  reporters: ['default', ['jest-junit', { outputDirectory: 'test/reports' }]],
  roots: ['src', 'test'],
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/src/config/'],
  testTimeout: 10000,
  verbose: true
};
