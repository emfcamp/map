import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig } from 'eslint/config'
import eslintConfigPrettier from 'eslint-config-prettier/flat'

export default defineConfig({
  files: ['src/**/*.{js,mjs,cjs,ts,mts,cts}', './*.ts'],
  ignores: ['src/grist/grist-plugin-api.d.ts'],
  extends: [js.configs.recommended, tseslint.configs.recommended, eslintConfigPrettier],
  languageOptions: { globals: globals.browser },
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
  },
})
