import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default defineConfig(
  { ignores: ['node_modules/**', '.wxt/**', '.output/**', 'coverage/**', 'test-results/**', 'playwright-report/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommended],
  },
  {
    files: ['**/*.tsx'],
    extends: [react.configs.flat.recommended, react.configs.flat['jsx-runtime'], reactHooks.configs.flat.recommended],
    settings: { react: { version: 'detect' } },
    rules: { 'react/prop-types': 'off' },
  },
  {
    files: ['entrypoints/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/tests/**', '**/fixtures/**', '**/mocks/**', '**/demo/**', '**/*.test.*', '**/*.spec.*', 'vitest', 'vitest/*', '@playwright/test'], message: 'Production composition must not import test, fixture, mock, or demo modules.' },
        ],
      }],
    },
  },
  {
    files: ['tools/provider-validation/service.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{
        group: ['**/storage/**', '**/sync/**', '**/runtime/**', '**/auth/service', 'dexie', '**/tests/**', '**/fixtures/**'],
        message: 'Observation must not acquire storage, sync, cleanup or finalization capabilities.',
      }] }],
    },
  },
  {
    files: ['entrypoints/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{
        group: ['**/provider-validation/**', '**/tests/**', '**/fixtures/**', '**/mocks/**', '**/demo/**', '**/*.test.*', '**/*.spec.*', 'vitest', 'vitest/*', '@playwright/test'],
        message: 'Production must not import release observation or test composition.',
      }] }],
    },
  },
  {
    files: ['src/provider/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/storage/**', 'dexie', '**/tests/**', '**/fixtures/**', '**/mocks/**', '**/demo/**', '**/*.test.*', '**/*.spec.*', 'vitest', 'vitest/*', '@playwright/test'], message: 'Providers return validated data and must not import storage or test composition.' },
        ],
      }],
    },
  },
);
