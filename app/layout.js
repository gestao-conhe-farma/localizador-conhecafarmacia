import { Suspense } from 'react'
import { headers } from 'next/headers'
// Fontes self-hosted (fontsource): o next/font/google baixava as fontes em
// cada build e ficava preso sem rede — agora o build é 100% offline.
import '@fontsource-variable/inter'
import '@fontsource-variable/fraunces'
import '@fontsource-variable/fraunces/full-italic.css'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import ThemeProvider from '@/components/providers/ThemeProvider'
import '@/styles/globals.css'

const inter = {
  variable: '--font-inter',
  style: { fontFamily: 'Inter Variable, ui-sans-serif, system-ui, sans-serif' },
}

const fraunces = {
  variable: '--font-fraunces',
  style: { fontFamily: 'Fraunces Variable, Georgia, serif' },
}

export const metadata = {
  metadataBase: new URL('https://localizador.conhecafarmacia.com'),
  title: {
    default: 'Localizador de Medicamentos — Conheça Farmácia',
    template: '%s | Conheça Farmácia',
  },
  description:
    'Pesquise o medicamento e veja em segundos quais as farmácias de Luanda que o têm em stock, com informação confirmada pela própria farmácia. Um serviço gratuito da Conheça Farmácia.',
  openGraph: {
    title: 'Localizador de Medicamentos — Conheça Farmácia',
    description:
      'Pesquise o medicamento e veja em segundos quais as farmácias de Luanda que o têm em stock. Um serviço gratuito da Conheça Farmácia.',
    url: 'https://localizador.conhecafarmacia.com',
    siteName: 'Conheça Farmácia — Localizador de Medicamentos',
    locale: 'pt_PT',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Localizador de Medicamentos — Conheça Farmácia',
    description:
      'Pesquise o medicamento e veja em segundos quais as farmácias de Luanda que o têm em stock. Um serviço gratuito da Conheça Farmácia.',
  },
  icons: {
    icon: '/icon.png',
    apple: '/apple-icon.png',
  },
}

export default async function RootLayout({ children }) {
  // CSP nonce set by proxy.js on every request. Applied to the anti-FOUC
  // inline script so the strict script-src (no 'unsafe-inline') lets it
  // through. Falls back to undefined on routes the proxy does not match.
  const headersList = await headers()
  const nonce = headersList.get('x-csp-nonce') || undefined

  return (
    <html lang="pt" suppressHydrationWarning className={`${inter.variable} ${fraunces.variable}`}>
      <head>
        {/* Anti-FOUC: set dark class before hydration. O nonce permite que
            este script inline corra sob a CSP estrita gerada no proxy.js.
            suppressHydrationWarning evita mismatch em dev (Turbopack) onde
            o proxy não corre. */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches);if(d)document.documentElement.classList.add('dark')}catch(e){}})()`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <Suspense fallback={null}>{children}</Suspense>
          <Analytics />
          <SpeedInsights />
        </ThemeProvider>
      </body>
    </html>
  )
}
