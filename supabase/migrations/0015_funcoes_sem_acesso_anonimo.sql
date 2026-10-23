-- =============================================================================
-- 0015 · Funções internas não podem ser chamadas sem login
-- Antes, qualquer pessoa com a chave pública do site podia chamar, sem login,
-- funções como registrar_emissao (gravava emissões com nomes e CPFs).
-- Também: registrar_emissao só grava para perfis de edição (admin, sesmt,
-- almoxarifado, rh). Funções de gatilho continuam disparando normalmente.
-- Aplicada em produção em 23/10/2026.
-- =============================================================================
revoke execute on function public.admin_atividade_recente(integer, integer, uuid) from public, anon;
revoke execute on function public.admin_dashboard_stats() from public, anon;
revoke execute on function public.admin_definir_papel(uuid, text) from public, anon;
revoke execute on function public.admin_resumo_usuarios() from public, anon;
revoke execute on function public.registrar_emissao(text, text, text, date, integer, jsonb, jsonb) from public, anon;
revoke execute on function public.registrar_evento(text, text, text, text, text, jsonb) from public, anon;
revoke execute on function public.tem_papel(text[]) from public, anon;
revoke execute on function public.on_auth_user_created() from public, anon, authenticated;
revoke execute on function public.registrar_historico_locker() from public, anon, authenticated;

grant execute on function public.admin_atividade_recente(integer, integer, uuid) to authenticated;
grant execute on function public.admin_dashboard_stats() to authenticated;
grant execute on function public.admin_definir_papel(uuid, text) to authenticated;
grant execute on function public.admin_resumo_usuarios() to authenticated;
grant execute on function public.registrar_emissao(text, text, text, date, integer, jsonb, jsonb) to authenticated;
grant execute on function public.registrar_evento(text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.tem_papel(text[]) to authenticated;

create or replace function public.registrar_emissao(p_template text, p_treinamento text, p_norma text, p_data date, p_validade integer, p_shared jsonb, p_colaboradores jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'auth'
as $function$
declare
    v_emissao_id uuid;
    v_item jsonb;
begin
    if not public.pode_editar() then
        raise exception 'Seu perfil não permite registrar emissões de certificados.';
    end if;

    insert into public.certificados_emissoes (user_id, template, treinamento, norma, data, validade_meses, shared)
    values (auth.uid(), p_template, p_treinamento, p_norma, p_data, p_validade, p_shared)
    returning id into v_emissao_id;

    for v_item in select * from jsonb_array_elements(p_colaboradores)
    loop
        insert into public.certificados_participantes (emissao_id, nome, cpf)
        values (v_emissao_id, v_item->>'nome', v_item->>'cpf');
    end loop;

    return v_emissao_id;
end;
$function$;

alter function public.set_updated_at() set search_path = public;

-- DESFAZER: grant execute ... to anon nas funções acima e remover o bloco
-- "if not public.pode_editar()" de registrar_emissao.
