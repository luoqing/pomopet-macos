import js from '@eslint/js';

export default [
  { ignores: ['node_modules/**', 'dist/**', 'prototype/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: {
      window: 'readonly', document: 'readonly', navigator: 'readonly', Audio: 'readonly',
      HTMLElement: 'readonly', HTMLInputElement: 'readonly', setTimeout: 'readonly',
      clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
      process: 'readonly', Buffer: 'readonly', console: 'readonly', structuredClone: 'readonly'
    } }
  }
];
