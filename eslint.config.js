import js from '@eslint/js';
import globals from 'globals';
import compat from 'eslint-plugin-compat';

const unused = ['error', { args: 'after-used', caughtErrors: 'none' }];

export default [
  { ignores: ['node_modules/**', 'coverage/**', 'dist/**'] },
  js.configs.recommended,
  {
    // Shipped to the browser. ES2021 syntax is the ceiling Safari 15 handles
    // everywhere, and eslint-plugin-compat checks the APIs against .browserslistrc.
    files: ['app/frontend/js/**/*.js'],
    ...compat.configs['flat/recommended'],
    languageOptions: { ecmaVersion: 2021, sourceType: 'module', globals: globals.browser },
    rules: {
      ...compat.configs['flat/recommended'].rules,
      'no-unused-vars': unused,
      eqeqeq: 'error',
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  {
    // Classic script that runs before first paint, so it stays ES5-style.
    files: ['app/frontend/js/boot.js'],
    languageOptions: { sourceType: 'script' },
    rules: { 'no-var': 'off' },
  },
  {
    files: ['tests/**/*.js', 'scripts/**/*.mjs', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: globals.node },
    rules: { 'no-unused-vars': unused, eqeqeq: 'error', 'prefer-const': 'error' },
  },
];
