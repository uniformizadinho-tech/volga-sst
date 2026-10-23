import { supabase } from "@/lib/supabase";

/**
 * Configurações e listas que antes ficavam só no navegador de cada pessoa.
 * Agora são gravadas na tabela `app_shared_state` do Supabase, visível para
 * todos os usuários logados. O localStorage vira apenas cache.
 */
export const SHARED_KEYS = [
  "volga:cert-instructors:v1",
  "volga:cert-instructors-hidden:v1",
  "volga:cert-history:v1",
  "volga:validades-janela:v1",
  "volga:inspecoes:v1",
  "volga:training-matrix:v1",
] as const;

export type SharedKey = (typeof SHARED_KEYS)[number];

/** Baixa todas as chaves compartilhadas da nuvem para o cache local. */
export async function pullSharedState(): Promise<boolean> {
  if (typeof window === "undefined") return true;
  const { data, error } = await supabase
    .from("app_shared_state")
    .select("key, value")
    .in("key", SHARED_KEYS as unknown as string[]);
  if (error) {
    console.error("[shared] falha ao carregar dados compartilhados:", error.message);
    return false;
  }
  const found = new Set<string>();
  let cacheOk = true;
  for (const row of (data ?? []) as { key: string; value: string }[]) {
    found.add(row.key);
    try {
      window.localStorage.setItem(row.key, row.value);
    } catch (cacheError) {
      cacheOk = false;
      console.error(`[shared] falha ao atualizar o cache local de ${row.key}:`, cacheError);
    }
  }
  // Primeira vez: o que existir só neste navegador sobe para a nuvem.
  let migrationOk = true;
  for (const key of SHARED_KEYS) {
    if (found.has(key)) continue;
    const local = window.localStorage.getItem(key);
    if (local && !(await pushShared(key, local))) migrationOk = false;
  }
  return migrationOk && cacheOk;
}

/** Grava uma chave compartilhada na nuvem (todos os usuários passam a ver). */
export async function pushShared(key: SharedKey, value: string): Promise<boolean> {
  const { error } = await supabase
    .from("app_shared_state")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) {
    console.error(`[shared] falha ao salvar ${key}:`, error.message);
    return false;
  }
  return true;
}

/**
 * Lê o valor atual da nuvem, aplica `mutate` sobre ele e grava somente se ninguém tiver
 * alterado o registro nesse meio tempo. Em caso de corrida, relê e tenta de novo, de forma
 * que alterações simultâneas de pessoas diferentes são mescladas em vez de sobrescritas.
 * Retorna o valor final gravado.
 */
export async function updateSharedWithRetry(
  key: SharedKey,
  mutate: (remote: string | null) => string,
  attempts = 4,
): Promise<string> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const { data: current, error: readError } = await supabase
      .from("app_shared_state")
      .select("value, updated_at")
      .eq("key", key)
      .maybeSingle();
    if (readError) throw new Error("Não foi possível ler a versão compartilhada.");

    const value = mutate(current ? String(current.value) : null);
    const updatedAt = new Date(
      Math.max(Date.now(), (current ? Date.parse(String(current.updated_at)) : 0) + 1),
    ).toISOString();
    const query = current
      ? supabase
          .from("app_shared_state")
          .update({ value, updated_at: updatedAt })
          .eq("key", key)
          .eq("updated_at", current.updated_at)
      : supabase.from("app_shared_state").insert({ key, value, updated_at: updatedAt });
    const { data, error } = await query.select("updated_at").maybeSingle();

    if (error && error.code !== "23505") {
      throw new Error("Não foi possível salvar na nuvem. Verifique a conexão e tente novamente.");
    }
    if (!error && data) {
      try {
        window.localStorage.setItem(key, value);
      } catch (cacheError) {
        console.warn("Salvo na nuvem, mas o cache local não pôde ser atualizado.", cacheError);
      }
      return value;
    }
    // Outra pessoa gravou entre a leitura e a escrita: tenta novamente com a versão nova.
  }
  throw new Error("Muitas alterações simultâneas. Tente novamente em instantes.");
}

/**
 * Substitui um snapshot compartilhado somente se o valor remoto ainda for o que
 * este navegador carregou. O filtro adicional por `updated_at` fecha a janela
 * entre a leitura e o UPDATE; uma edição concorrente vira conflito explícito.
 */
export async function saveSharedSnapshot(key: SharedKey, value: string): Promise<void> {
  const cached = window.localStorage.getItem(key);
  const { data: current, error: readError } = await supabase
    .from("app_shared_state")
    .select("value, updated_at")
    .eq("key", key)
    .maybeSingle();

  if (readError)
    throw new Error("Não foi possível conferir a versão compartilhada antes de salvar.");
  if (current && cached !== current.value) {
    throw new Error(
      "Outra pessoa atualizou este cadastro. Recarregue os dados antes de tentar novamente.",
    );
  }

  const updatedAt = new Date(
    Math.max(Date.now(), (current ? Date.parse(String(current.updated_at)) : 0) + 1),
  ).toISOString();
  const query = current
    ? supabase
        .from("app_shared_state")
        .update({ value, updated_at: updatedAt })
        .eq("key", key)
        .eq("updated_at", current.updated_at)
    : supabase.from("app_shared_state").insert({ key, value, updated_at: updatedAt });
  const { data, error } = await query.select("updated_at").maybeSingle();

  if (error) {
    if (error.code === "23505") {
      throw new Error(
        "Outra pessoa criou este cadastro ao mesmo tempo. Recarregue os dados e tente novamente.",
      );
    }
    throw new Error(
      "Não foi possível salvar o cadastro compartilhado. Verifique a conexão e tente novamente.",
    );
  }
  if (!data) {
    throw new Error(
      "Outra pessoa atualizou este cadastro. Recarregue os dados antes de tentar novamente.",
    );
  }

  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    console.warn("Cadastro salvo na nuvem, mas o cache local não pôde ser atualizado.", error);
  }
}
