-- =============================================================================
-- 0013 · Acesso aos dados somente para contas com perfil
-- -----------------------------------------------------------------------------
-- Antes: várias tabelas liberavam leitura e escrita para QUALQUER conta logada
-- (e o cadastro é aberto), e 4 tabelas antigas liberavam tudo até sem login.
-- Depois:
--   • ler            → qualquer perfil válido (admin, sesmt, almoxarifado, rh, leitor)
--   • gravar/excluir → qualquer perfil, exceto "leitor"
--   • tabelas antigas não usadas pelo app → somente admin
-- Também cria a coluna user_roles.updated_at, que a função admin_definir_papel
-- usa e não existia (a troca de perfil na Administração falhava).
--
-- Nenhum dado é apagado. Funções security definer (registrar_emissao,
-- registrar_evento, admin_*) continuam funcionando como antes.
-- Como desfazer: bloco "DESFAZER" no final.
-- =============================================================================

begin;

-- 1) Coluna que faltava para admin_definir_papel / garantir_meu_perfil
alter table public.user_roles
  add column if not exists updated_at timestamptz not null default now();

-- 2) Funções auxiliares (security definer: leem user_roles sem depender de RLS)
create or replace function public.tem_algum_papel()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid())
      and papel in ('admin', 'sesmt', 'almoxarifado', 'rh', 'leitor')
  );
$$;

create or replace function public.pode_editar()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid())
      and papel in ('admin', 'sesmt', 'almoxarifado', 'rh')
  );
$$;

revoke all on function public.tem_algum_papel() from public, anon;
revoke all on function public.pode_editar() from public, anon;
grant execute on function public.tem_algum_papel() to authenticated;
grant execute on function public.pode_editar() to authenticated;

-- 3) Tabelas do app com leitura/escrita para qualquer conta logada
do $$
declare
  t text;
begin
  foreach t in array array['app_shared_state', 'estoque_itens', 'estoque_lancamentos', 'lockers', 'templates']
  loop
    execute format('drop policy if exists "todos logados acessam" on public.%I', t);
    execute format('drop policy if exists perfil_le on public.%I', t);
    execute format('drop policy if exists perfil_insere on public.%I', t);
    execute format('drop policy if exists perfil_altera on public.%I', t);
    execute format('drop policy if exists perfil_exclui on public.%I', t);
    execute format('create policy perfil_le on public.%I for select to authenticated using (public.tem_algum_papel())', t);
    execute format('create policy perfil_insere on public.%I for insert to authenticated with check (public.pode_editar())', t);
    execute format('create policy perfil_altera on public.%I for update to authenticated using (public.pode_editar()) with check (public.pode_editar())', t);
    execute format('create policy perfil_exclui on public.%I for delete to authenticated using (public.pode_editar())', t);
  end loop;
end
$$;

-- 4) Histórico de armários (somente leitura pelo app)
drop policy if exists "todos logados leem historico" on public.lockers_historico;
drop policy if exists perfil_le on public.lockers_historico;
create policy perfil_le on public.lockers_historico
  for select to authenticated using (public.tem_algum_papel());

-- 5) Emissões e participantes de certificados (nomes e CPFs)
drop policy if exists "Usuários autenticados podem ver emissões" on public.certificados_emissoes;
drop policy if exists certificados_read_authenticated on public.certificados_emissoes;
drop policy if exists perfil_le on public.certificados_emissoes;
create policy perfil_le on public.certificados_emissoes
  for select to authenticated using (public.tem_algum_papel());

drop policy if exists "Usuários autenticados podem ver participantes" on public.certificados_participantes;
drop policy if exists participantes_read_authenticated on public.certificados_participantes;
drop policy if exists perfil_le on public.certificados_participantes;
create policy perfil_le on public.certificados_participantes
  for select to authenticated using (public.tem_algum_papel());

-- 6) Leituras de estoque (tabela antiga, liberada para qualquer logado)
drop policy if exists "Usuários autenticados leem as leituras de estoque" on public.estoque_leituras;
drop policy if exists "Usuários autenticados registram leituras de estoque" on public.estoque_leituras;
drop policy if exists "Usuários autenticados excluem leituras de estoque" on public.estoque_leituras;
drop policy if exists perfil_le on public.estoque_leituras;
drop policy if exists perfil_insere on public.estoque_leituras;
drop policy if exists perfil_exclui on public.estoque_leituras;
create policy perfil_le on public.estoque_leituras for select to authenticated using (public.tem_algum_papel());
create policy perfil_insere on public.estoque_leituras for insert to authenticated with check (public.pode_editar());
create policy perfil_exclui on public.estoque_leituras for delete to authenticated using (public.pode_editar());

-- 7) Perfis: cada um lê o próprio; admin lê todos (políticas já existentes).
--    Remove a política que deixava qualquer conta ler os perfis de todos.
drop policy if exists "Usuários autenticados podem ler perfis" on public.user_roles;

-- 8) Tabelas antigas, vazias e não usadas pelo app, abertas até sem login
do $$
declare
  t text;
begin
  foreach t in array array['certificates', 'consent_letters', 'instructors', 'sync_status']
  loop
    execute format('drop policy if exists %I on public.%I', 'public_all_' || t, t);
    execute format('drop policy if exists somente_admin on public.%I', t);
    execute format('create policy somente_admin on public.%I for all to authenticated using (public.tem_papel(array[''admin''])) with check (public.tem_papel(array[''admin'']))', t);
  end loop;
end
$$;

commit;

-- =============================================================================
-- DESFAZER (recria exatamente as políticas anteriores)
-- =============================================================================
-- begin;
-- do $$ declare t text; begin
--   foreach t in array array['app_shared_state','estoque_itens','estoque_lancamentos','lockers','templates'] loop
--     execute format('drop policy if exists perfil_le on public.%I', t);
--     execute format('drop policy if exists perfil_insere on public.%I', t);
--     execute format('drop policy if exists perfil_altera on public.%I', t);
--     execute format('drop policy if exists perfil_exclui on public.%I', t);
--     execute format('create policy "todos logados acessam" on public.%I for all to authenticated using (true) with check (true)', t);
--   end loop;
--   foreach t in array array['certificates','consent_letters','instructors','sync_status'] loop
--     execute format('drop policy if exists somente_admin on public.%I', t);
--     execute format('create policy %I on public.%I for all to public using (true) with check (true)', 'public_all_' || t, t);
--   end loop;
-- end $$;
-- drop policy if exists perfil_le on public.lockers_historico;
-- create policy "todos logados leem historico" on public.lockers_historico for select to authenticated using (true);
-- drop policy if exists perfil_le on public.certificados_emissoes;
-- create policy certificados_read_authenticated on public.certificados_emissoes for select to authenticated using (true);
-- drop policy if exists perfil_le on public.certificados_participantes;
-- create policy participantes_read_authenticated on public.certificados_participantes for select to authenticated using (true);
-- drop policy if exists perfil_le on public.estoque_leituras;
-- drop policy if exists perfil_insere on public.estoque_leituras;
-- drop policy if exists perfil_exclui on public.estoque_leituras;
-- create policy "Usuários autenticados leem as leituras de estoque" on public.estoque_leituras for select using (auth.role() = 'authenticated');
-- create policy "Usuários autenticados registram leituras de estoque" on public.estoque_leituras for insert with check (auth.role() = 'authenticated');
-- create policy "Usuários autenticados excluem leituras de estoque" on public.estoque_leituras for delete using (auth.role() = 'authenticated');
-- create policy "Usuários autenticados podem ler perfis" on public.user_roles for select to authenticated using (true);
-- commit;
-- (a coluna user_roles.updated_at pode ficar; ela só corrige a troca de perfil)
