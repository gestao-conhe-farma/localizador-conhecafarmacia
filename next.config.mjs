/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false, // reduz fingerprinting

  // Cache persistente do Turbopack DESLIGADO (Next 16). No Windows a escrita
  // do cache em .next/dev/cache/turbopack é dolorosamente lenta (vimos 4.9min
  // num único write-back) e cache corrompido deixa o dev server "wedged"
  // (vercel/next.js #95495, discussion #87283). Sem o cache de disco as
  // compilações são só em memória: primeiro arranque mais lento, depois
  // rápido e estável. Remover esta linha quando o bug upstream fechar.
  experimental: {
    turbopackFileSystemCacheForDev: false,
  },
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
