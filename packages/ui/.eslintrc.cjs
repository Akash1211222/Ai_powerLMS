module.exports = {
  ...require('@fca/config/eslint/node'),
  parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
  env: { browser: true, es2022: true },
};
