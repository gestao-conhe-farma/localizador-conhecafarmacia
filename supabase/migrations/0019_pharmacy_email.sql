-- 0019 · Email de contacto da farmácia
--
-- A secção «Informações» de /portal/sessão passa a editar nome,
-- telefone, EMAIL e whatsapp num drawer. Nome, telefone e whatsapp já
-- existiam em `pharmacies` (0001); o email não — cria-se aqui como
-- coluna opcional (o e-mail de login continua no auth.users e serve
-- de valor inicial/mostra até este ser preenchido).
--
-- Aplicar: npx supabase db push  (ou correr este ficheiro no SQL Editor)

alter table public.pharmacies
  add column if not exists email text;

comment on column public.pharmacies.email is
  'Email de contacto da farmácia, editável no portal (secção Informações de /portal/sessão).';
