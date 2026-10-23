-- =============================================================================
-- 0014 · Remove política recursiva em user_roles
-- A política user_roles_read_own_or_admin consultava user_roles dentro da própria
-- política de user_roles (erro "infinite recursion detected" para quem lê a tabela
-- direto). A política equivalente roles_select_proprio_ou_admin, que usa a função
-- security definer tem_papel, continua valendo: cada um lê o próprio perfil; admin
-- lê todos. Aplicada em produção em 23/10/2026.
-- =============================================================================
drop policy if exists user_roles_read_own_or_admin on public.user_roles;

-- DESFAZER:
-- create policy user_roles_read_own_or_admin on public.user_roles for select to authenticated
--   using ((user_id = auth.uid()) or (exists (select 1 from user_roles ur where ur.user_id = auth.uid() and ur.papel = 'admin')));
