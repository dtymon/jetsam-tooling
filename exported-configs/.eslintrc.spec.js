const baseConfig = require('./.eslintrc.js');

module.exports = {
  ...baseConfig,
  parserOptions: {
    project: 'tsconfig.spec.json',
    sourceType: 'module'
  },
  rules: {
    ...baseConfig.rules,
    '@typescript-eslint/no-empty-function': 'off'
  }
};
