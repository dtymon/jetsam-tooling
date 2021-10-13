const baseConfig = require('./exports/jest.config.js');

module.exports = {
  ...baseConfig,
  testMatch: ['<rootDir>/(src|test)/**/*.spec.ts'],
};
