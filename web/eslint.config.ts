import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig } from 'eslint/config'

export default defineConfig({
  files: ['src/*.{js,mjs,cjs,ts,mts,cts}', './*.ts'],
  extends: [js.configs.recommended, tseslint.configs.recommended],
  languageOptions: { globals: globals.browser },
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
  },
})
