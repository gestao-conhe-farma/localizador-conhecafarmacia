-- ============================================================
-- 0033 · Correcção da policy de INSERT dos recibos de avisos
--
-- O QUE FALHOU (medido a 18/10/2026): o INSERT em
-- `pharmacy_announcement_reads` pela farmácia devolvia
-- `42501 permission denied for table pharmacy_announcements`.
--
-- A policy da 0032 validava o aviso com uma subconsulta a
-- `pharmacy_announcements` que lia `archived_at` e `expires_at`. A farmácia
-- tem grant POR COLUNA (de propósito: não vê os campos internos nem
-- arquivados), e a subconsulta dentro da policy não consegue ler essas
-- colunas com os privilégios de quem insere — a inserção falhava antes de
-- gravar o recibo, e o portal ficava com o aviso eternamente «por ler».
--
-- A CORRECÇÃO separa as duas regras, cada uma no sítio onde é aplicável:
--
--   • SELECT — a farmácia só vê avisos dirigidos a ela, dentro do prazo e
--     não arquivados (policy da 0032, intocada);
--   • INSERT do recibo — só para a própria farmácia. Um recibo de um aviso
--     que ela não pode ler é inerte: não devolve conteúdo nenhum, e o
--     SELECT dos recibos continua a mostrar apenas os da própria farmácia.
--     A aplicação já filtra os ids visíveis antes de inserir; esta policy
--     é a rede contra escrever em nome de OUTRA farmácia.
--
-- Aplicar: python scripts/apply-migration.py supabase/migrations/0033_announcement_reads_policy_fix.sql
-- ============================================================

drop policy if exists "announcement reads insert own" on public.pharmacy_announcement_reads;

create policy "announcement reads insert own"
  on public.pharmacy_announcement_reads for insert to authenticated
  with check (public.is_own_pharmacy(pharmacy_id));

-- Verificação: a policy existe e é a única de INSERT na tabela.
do $$
declare
  total int;
begin
  select count(*) into total
  from pg_policies
  where schemaname = 'public'
    and tablename = 'pharmacy_announcement_reads'
    and cmd = 'INSERT';

  if total <> 1 then
    raise exception 'Esperada 1 policy de INSERT nos recibos, encontradas %', total;
  end if;
end $$;
