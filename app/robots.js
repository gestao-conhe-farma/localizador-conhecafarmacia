import { SITE_URL } from '@/lib/constants'

export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // `/interno` é a área da equipa: não há nada lá para um motor de busca
      // (e cada página dela exige sessão). Fecha-se aqui E no metadata de
      // cada página — nenhuma das duas coisas sozinha impede a indexação.
      // `/portal` fica de fora deste disallow de propósito: o login da
      // farmácia é um destino legítimo de quem procura «portal da farmácia».
      disallow: ['/api/', '/interno'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
