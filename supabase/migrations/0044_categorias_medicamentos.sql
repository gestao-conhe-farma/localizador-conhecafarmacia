-- ------------------------------------------------------------
-- 0044 — Medicamentos que ficaram sem área clínica na 0043
--
-- A 0043 mapeou o catálogo inicial; estes nove medicamentos entraram
-- depois e ficaram com `category = null`, o que os tornava invisíveis
-- nos cards de área da homepage. Cada update mexe só em `null`, por
-- isso não sobrepõe uma área já definida (nem uma escolha futura da
-- farmácia) e pode voltar a correr sem efeito.
-- ------------------------------------------------------------

-- Doenças crónicas: anticoagulantes, anti-hipertensores, diabetes.
update public.drugs
   set category = 'cronicos'
 where kind = 'medicamento'
   and category is null
   and lower(name) in (
     'sintrom',
     'varfarina',
     'atenolol',
     'losartana',
     'glibenclamida',
     'insulina nph'
   );

-- Anti-infecciosos.
update public.drugs
   set category = 'antibioticos'
 where kind = 'medicamento'
   and category is null
   and lower(name) = 'metronidazol';

-- Via respiratória (asma/DPOC): é a área que a homepage chama «Gripe e
-- tosse».
update public.drugs
   set category = 'gripe-tosse'
 where kind = 'medicamento'
   and category is null
   and lower(name) = 'salbutamol';

-- Suplemento, sem área própria na taxonomia.
update public.drugs
   set category = 'outros-clinicos'
 where kind = 'medicamento'
   and category is null
   and lower(name) = 'ácido fólico';

-- Verificação não bloqueante: se entrar um medicamento novo sem área, a
-- migração avisa em vez de falhar (a 0043 já não é a única entrada).
do $$
declare
  v_sem_categoria int;
begin
  select count(*) into v_sem_categoria
    from public.drugs
   where kind = 'medicamento'
     and active
     and category is null;

  if v_sem_categoria > 0 then
    raise notice 'Medicamentos activos ainda sem área clínica: %', v_sem_categoria;
  end if;
end $$;
