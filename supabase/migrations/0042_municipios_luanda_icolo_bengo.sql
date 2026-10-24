-- 0042 · MUNICÍPIOS DA NOVA DIVISÃO POLÍTICO-ADMINISTRATIVA
--
-- PORQUÊ: desde 1 de Janeiro de 2025 a província de Luanda tem 16
-- municípios (a capital é Ingombota, não «Luanda») e a província de
-- Ícolo e Bengo — criada na mesma reforma — tem 7 (capital Catete). O
-- CHECK da 0001 ainda tinha os 7 municípios antigos de Luanda, pelo que
-- nenhuma farmácia de Ingombota, Maianga, Kilamba, Camama, Mulenvos,
-- Mussulo, Hoji ya Henda ou de Ícolo e Bengo podia ser gravada.
--
-- MIGRAÇÃO DE DADOS: os nomes antigos que já existem passam para o nome
-- actual. «Luanda» (município) passou a «Ingombota»; «Ícolo e Bengo»
-- (município) passou a «Catete», a capital da nova província;
-- «Quilamba Quiaxi» e «Quissama» passam a «Kilamba Kiaxi» e «Quiçama».
--
-- ORDEM: o CHECK antigo tem de cair ANTES do update — os nomes novos
-- («Ingombota», «Catete») não estão na lista da 0001, pelo que o update
-- violaria a constraint a meio da migração.
--
-- Aplicar: python scripts/apply-migration.py supabase/migrations/0042_municipios_luanda_icolo_bengo.sql

alter table public.pharmacies
  drop constraint if exists pharmacies_municipio_check;

update public.pharmacies
   set municipio = case municipio
                     when 'Luanda' then 'Ingombota'
                     when 'Ícolo e Bengo' then 'Catete'
                     when 'Quilamba Quiaxi' then 'Kilamba Kiaxi'
                     when 'Quissama' then 'Quiçama'
                     else municipio
                   end
 where municipio in ('Luanda', 'Ícolo e Bengo', 'Quilamba Quiaxi', 'Quissama');

alter table public.pharmacies
  add constraint pharmacies_municipio_check check (municipio in (
    -- Luanda — 16 municípios
    'Belas', 'Cacuaco', 'Camama', 'Cazenga', 'Hoji ya Henda', 'Ingombota',
    'Kilamba', 'Kilamba Kiaxi', 'Maianga', 'Mulenvos', 'Mussulo', 'Rangel',
    'Samba', 'Sambizanga', 'Talatona', 'Viana',
    -- Ícolo e Bengo — 7 municípios
    'Bom Jesus', 'Cabiri', 'Cabo Ledo', 'Calumbo', 'Catete', 'Quiçama', 'Sequele'
  ));

-- Verificação: nenhuma linha ficou fora da lista nova.
do $$
declare
  v_fora int;
begin
  select count(*) into v_fora
  from public.pharmacies
  where municipio not in (
    'Belas', 'Cacuaco', 'Camama', 'Cazenga', 'Hoji ya Henda', 'Ingombota',
    'Kilamba', 'Kilamba Kiaxi', 'Maianga', 'Mulenvos', 'Mussulo', 'Rangel',
    'Samba', 'Sambizanga', 'Talatona', 'Viana',
    'Bom Jesus', 'Cabiri', 'Cabo Ledo', 'Calumbo', 'Catete', 'Quiçama', 'Sequele'
  );

  if v_fora <> 0 then
    raise exception '0042: % farmácia(s) com município fora da lista', v_fora;
  end if;
end $$;
