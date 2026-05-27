/** ESLint config preset for Node services (Azure Functions, libraries). */
module.exports = {
  extends: [require.resolve('./index.cjs'), 'plugin:import/recommended', 'plugin:import/typescript'],
  plugins: ['import'],
  env: {
    node: true,
  },
  settings: {
    'import/resolver': {
      typescript: { alwaysTryTypes: true },
      node: true,
    },
  },
  rules: {
    'import/order': [
      'warn',
      {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'always',
        alphabetize: { order: 'asc', caseInsensitive: true },
      },
    ],
  },
};
