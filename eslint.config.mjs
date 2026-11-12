import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'

// eslint-config-next 16 exporta já flat configs — sem FlatCompat.
const eslintConfig = [
  // Dumps vendored (extensões de browser capturadas, snapshots de design):
  // código de terceiros só para referência, nunca corre na app. O bundle das
  // categorias é gerado por `npm run categorias:build` (esbuild) — o fonte é
  // scripts/categorias/*.jsx, que continua a ser linted.
  { ignores: ['_design/**', '.agents/**', 'scripts/categorias/cena.bundle.js'] },
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
