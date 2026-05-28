module.exports = {
  root: true,
  extends: ['@cipp-google/eslint-config/node'],
  settings: {
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
        project: ['./tsconfig.json', '../../packages/*/tsconfig.json'],
      },
      node: true,
    },
  },
  rules: {
    'import/no-unresolved': [
      'error',
      {
        ignore: ['^@cipp-google/audit$', '^@cipp-google/adapter-mock$'],
      },
    ],
  },
};
