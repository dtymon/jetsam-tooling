const baseConfig = require('./exported-configs/jest.config.js');

module.exports = {
  ...baseConfig,
  testMatch: ['<rootDir>/(src|test)/**/*.spec.ts'],
};
