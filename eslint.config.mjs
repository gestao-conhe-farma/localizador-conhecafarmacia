import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
})

const eslintConfig = [
  ...compat.extends('next/core-web-vitals'),
  {
    rules: {
      // @next/next/no-img-element: permitido em contexts específicos
      // (ex.: avatares de gravatar no header do principal).
      '@next/next/no-img-element': 'off',
    },
  },
]

export default eslintConfig
