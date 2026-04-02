// @ts-check

import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier/flat';

export default defineConfig(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    ignores: ['dist/', 'node_modules/', 'sonarlint-backend/', 'tests/fixtures/'],
  },
  {
    rules: {
      // SLOOP RPC protocol is untyped — any is unavoidable at the bridge boundary
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
