module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    sourceType: 'module'
  },
  plugins: ['@typescript-eslint', 'prettier', 'tsdoc'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/eslint-recommended',
    'prettier'
  ],
  root: true,
  env: {
    node: true,
    es6: true
  },
  rules: {
    'prettier/prettier': 'error',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/no-use-before-define': 'off',
    '@typescript-eslint/no-parameter-properties': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true, allowDefinitionFiles: false }],
    'tsdoc/syntax': 'warn'
  },
  overrides: [
    {
      files: ['src/lib/**/*.ts'],
      rules: {
        'no-console': ['error', { allow: ['warn', 'error'] }]
      }
    },
    {
      files: ['src/bin/**/*.ts'],
      rules: {
        'no-console': 'off',
        'no-undef': 'off',
        '@typescript-eslint/no-var-requires': 'off'
      }
    }
  ]
};
