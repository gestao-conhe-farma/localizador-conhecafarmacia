-- =====================================================================
-- 0052 — SEC-ATH-06: `aal2` nas tabelas da área interna
--
-- A matriz (`lib/platform/permissions.js`) já exige `aal2` nas acções
-- sensíveis, mas a autorização vivia só no código. Esta migração põe a
-- mesma exigência na base, para que uma Server Action com o cliente da
-- sessão não consiga escrever sem o segundo factor confirmado.
--
-- LEITURA: `platform_audit_log` passa a exigir `aal2`. É a tabela mais
-- sensível da área (quem leu o quê, antes/depois) e não é lida por
-- farmácias. `pharmacy_leads` fica igual (só service-role a alcança).
--
-- `admin_users` NÃO é restringida na leitura: é a tabela que resolve a
-- própria sessão (`admin_users self read`) e exigi-la `aal2` trancava toda
-- a gente fora antes de haver segundo factor para confirmar. A escrita é
-- que passa a exigir.
--
-- `pharmacy_announcements` e `pharmacy_staff` só levam a exigência nas
-- escritas: as farmácias leem os avisos e a equipa delas sem `aal2`, e isso
-- não muda.
--
-- Idempotente: apaga e recria as policies com o mesmo nome.
-- =====================================================================

do $$
declare
  t text;
  escritas text[] := array['admin_users', 'pharmacy_staff', 'pharmacy_announcements'];
begin
  -- Trilha de auditoria: leitura e escrita com segundo factor.
  execute 'drop policy if exists "aal2: leitura trilha" on localizador.platform_audit_log';
  execute 'create policy "aal2: leitura trilha" on localizador.platform_audit_log '
    || 'as restrictive for select to authenticated '
    || 'using ((select auth.jwt() ->> ''aal'') = ''aal2'')';

  execute 'drop policy if exists "aal2: escrita trilha" on localizador.platform_audit_log';
  execute 'create policy "aal2: escrita trilha" on localizador.platform_audit_log '
    || 'as restrictive for all to authenticated '
    || 'using ((select auth.jwt() ->> ''aal'') = ''aal2'') '
    || 'with check ((select auth.jwt() ->> ''aal'') = ''aal2'')';

  -- Leads: funil comercial, só a equipa. Sem policies permissivas hoje, mas
  -- se aparecer uma, já entra com a exigência do segundo factor.
  execute 'drop policy if exists "aal2: funil" on localizador.pharmacy_leads';
  execute 'create policy "aal2: funil" on localizador.pharmacy_leads '
    || 'as restrictive for all to authenticated '
    || 'using ((select auth.jwt() ->> ''aal'') = ''aal2'') '
    || 'with check ((select auth.jwt() ->> ''aal'') = ''aal2'')';

  foreach t in array escritas loop
    execute format('drop policy if exists %I on localizador.%I', 'aal2: escrita ' || t, t);
    execute format(
      'create policy %I on localizador.%I as restrictive for insert to authenticated '
      || 'with check ((select auth.jwt() ->> ''aal'') = ''aal2'')',
      'aal2: escrita ' || t, t
    );
    execute format('drop policy if exists %I on localizador.%I', 'aal2: alteracao ' || t, t);
    execute format(
      'create policy %I on localizador.%I as restrictive for update to authenticated '
      || 'using ((select auth.jwt() ->> ''aal'') = ''aal2'') '
      || 'with check ((select auth.jwt() ->> ''aal'') = ''aal2'')',
      'aal2: alteracao ' || t, t
    );
    execute format('drop policy if exists %I on localizador.%I', 'aal2: remocao ' || t, t);
    execute format(
      'create policy %I on localizador.%I as restrictive for delete to authenticated '
      || 'using ((select auth.jwt() ->> ''aal'') = ''aal2'')',
      'aal2: remocao ' || t, t
    );
  end loop;
end $$;
