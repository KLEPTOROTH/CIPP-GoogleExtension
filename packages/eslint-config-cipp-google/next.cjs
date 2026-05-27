/** ESLint config preset for Next.js apps (Pages Router + MUI). */
module.exports = {
  extends: [require.resolve('./index.cjs'), 'next/core-web-vitals'],
  rules: {
    'react/no-unescaped-entities': 'off',
  },
};
