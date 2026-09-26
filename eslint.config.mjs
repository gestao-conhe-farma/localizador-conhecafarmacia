import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'

// eslint-config-next 16 exporta já flat configs — sem FlatCompat.
const eslintConfig = [
  ...nextCoreWebVitals,
  {
    rules: {
      // @next/next/no-img-element: permitido em contexts específicos
      // (ex.: avatares de gravatar no header do principal).
      '@next/next/no-img-element': 'off',
    },
  },
]

export default eslintConfig
