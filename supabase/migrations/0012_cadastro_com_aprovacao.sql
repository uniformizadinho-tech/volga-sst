-- =============================================================================
-- 0012 · Cadastro com aprovação do administrador
-- -----------------------------------------------------------------------------
-- Antes: qualquer pessoa que criasse uma conta recebia um perfil automaticamente
-- (via garantir_meu_perfil) e entrava nos módulos.
-- Depois: a conta é criada SEM perfil. O app mostra "Aguardando liberação" até
-- um administrador escolher o perfil em Administração › Usuários
-- (RPC admin_definir_papel, que já existe).
--
-- Contas que já têm perfil NÃO são alteradas.
--
-- Como aplicar: Supabase › SQL Editor › colar este arquivo › Run.
-- Como desfazer: veja o bloco "DESFAZER" no final.
-- =============================================================================

begin;

-- 1) Guarda a versão atual da função, para poder voltar atrás.
do $$
declare
  definicao text;
begin
  -- Se a cópia já existe (migration reaplicada), mantém a original intacta.
  if to_regprocedure('public.garantir_meu_perfil_anterior()') is not null then
    return;
  end if;
  select pg_get_functiondef('public.garantir_meu_perfil()'::regprocedure) into definicao;
  definicao := replace(
    definicao,
    'public.garantir_meu_perfil(',
    'public.garantir_meu_perfil_anterior('
  );
  execute definicao;
  -- A cópia de segurança não deve ser chamada pelo app.
  execute 'revoke all on function public.garantir_meu_perfil_anterior() from public, anon, authenticated';
exception
  when undefined_function then null;  -- não havia função: nada a guardar
  when duplicate_function then null;  -- cópia já existe (migration reaplicada)
end
$$;

-- 2) Se a função atual não devolve text, ela precisa ser recriada.
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'garantir_meu_perfil'
      and p.pronargs = 0
      and p.prorettype <> 'text'::regtype
  ) then
    drop function public.garantir_meu_perfil();
  end if;
end
$$;

-- 3) Nova versão: apenas CONSULTA o perfil. Nunca cria perfil para conta nova.
--    Devolve null quando a conta ainda não foi liberada.
create or replace function public.garantir_meu_perfil()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select ur.papel::text
  from public.user_roles ur
  where ur.user_id = auth.uid()
  limit 1;
$$;

revoke all on function public.garantir_meu_perfil() from public, anon;
grant execute on function public.garantir_meu_perfil() to authenticated;

commit;

-- =============================================================================
-- CONFERÊNCIA (somente leitura) — rode depois de aplicar.
-- Lista as políticas RLS que NÃO consultam user_roles. Se alguma delas libera
-- leitura/escrita para qualquer usuário autenticado, uma conta "aguardando
-- liberação" ainda conseguiria acessar esses dados pela API. Nesses casos, a
-- política deve exigir um perfil, por exemplo:
--   using (exists (select 1 from public.user_roles r where r.user_id = auth.uid()))
-- =============================================================================
-- select schemaname, tablename, policyname, cmd, roles, qual, with_check
-- from pg_policies
-- where schemaname = 'public'
--   and coalesce(qual, '') || coalesce(with_check, '') not ilike '%user_roles%'
-- order by tablename, policyname;

-- =============================================================================
-- DESFAZER (volta ao comportamento anterior de criar perfil automaticamente)
-- =============================================================================
-- begin;
-- drop function public.garantir_meu_perfil();
-- alter function public.garantir_meu_perfil_anterior() rename to garantir_meu_perfil;
-- grant execute on function public.garantir_meu_perfil() to authenticated;
-- commit;
