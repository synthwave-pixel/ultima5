// ESLint for the port: typescript-eslint's recommended rules with type
// information, so unawaited promises and loose types are reported, and
// Prettier's config last so no rule argues with the formatter. The plain
// JavaScript - the pilot's console scripts, the Node tools, and the desktop
// and Android apps' .cjs - is linted without types, against its own globals.
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default defineConfig(
  { ignores: ['dist/', 'dev-dist/', 'node_modules/', 'public/'] },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js', 'vite.config.ts'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      // Command handlers are async as a family so callers await them alike; some have nothing to wait for.
      '@typescript-eslint/require-await': 'off',
      // A leading underscore marks a parameter kept for the interface.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      '@typescript-eslint/no-deprecated': 'error',
      '@typescript-eslint/only-throw-error': 'error',
    },
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    ignores: ['eslint.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  { files: ['tools/pilot/*.js'], languageOptions: { sourceType: 'script', globals: globals.browser } },
  { files: ['**/*.mjs'], languageOptions: { globals: globals.node } },
  { files: ['**/*.cjs'], languageOptions: { sourceType: 'commonjs', globals: { ...globals.node, ...globals.browser } } },
  prettier,
);
