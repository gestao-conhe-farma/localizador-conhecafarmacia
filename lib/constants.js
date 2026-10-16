export const SITE_URL = 'https://localizador.conhecafarmacia.com'
export const MAIN_SITE_URL = 'https://conhecafarmacia.com'
export const CONTACT_EMAIL = 'geral@conhecafarmacia.com'
export const CONTACT_PHONE_DISPLAY = '+244 925 696 002'
export const CONTACT_WHATSAPP = '244925696002'

/**
 * Municípios atendidos — a mesma lista do CHECK de `pharmacies` (0001).
 * Vive aqui e não no módulo de acções porque um ficheiro `'use server'` só
 * pode exportar funções async: constantes partilhadas por formulários e
 * validações têm de viver fora dele.
 */
export const MUNICIPIOS = [
  'Belas',
  'Cacuaco',
  'Cazenga',
  'Ícolo e Bengo',
  'Luanda',
  'Quilamba Quiaxi',
  'Quissama',
  'Talatona',
  'Viana',
]
