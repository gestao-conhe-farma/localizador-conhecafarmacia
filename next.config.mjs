/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false, // reduz fingerprinting
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  compiler: {
    removeConsole:
      process.env.NODE_ENV === 'production'
        ? { exclude: ['error', 'warn'] }
        : false,
  },

  // Security headers em todas as rotas. A Content-Security-Policy NÃO é
  // definida aqui — fonte única é o proxy.js (middleware), que gera um nonce
  // por pedido (script-src 'nonce-...', sem 'unsafe-inline'/'unsafe-eval').
  // Headers de middleware são sobrescritos pelos de next.config para o mesmo
  // header, por isso um CSP aqui anularia o nonce do proxy.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value:
              'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
    ]
  },
}

export default nextConfig
