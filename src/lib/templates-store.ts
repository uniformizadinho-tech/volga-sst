import { normalizeShared, type SharedFields } from "./certificate-template";
import { supabase } from "./supabase";
import { isBuiltInTemplateId, stripBuiltIns, withBuiltIns } from "./builtin-templates";

export { isBuiltInTemplateId } from "./builtin-templates";

export interface SavedTemplate {
  id: string;
  name: string;
  shared: SharedFields;
  updatedAt: number;
}

const KEY = "volga:cert-templates:v1";

interface TemplateRow {
  id: string;
  name: string;
  shared: SharedFields;
  updated_at: number;
}

/** Busca os modelos salvos na nuvem para o usuário logado.
 *  Sempre injeta os modelos fixos (built-in) no topo da lista. */
export async function loadTemplatesCloud(userId: string): Promise<SavedTemplate[]> {
  if (!supabase) return withBuiltIns([]);
  const { data, error } = await supabase
    .from("templates")
    .select("id, name, shared, updated_at")
    .order("updated_at", { ascending: false });

  if (error) throw error;

  const rows = ((data as TemplateRow[]) ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    shared: normalizeShared(row.shared),
    updatedAt: Number(row.updated_at),
  }));
  return withBuiltIns(rows);
}

// Fila para serializar as gravações: com várias abas/computadores usando a
// mesma conta, duas sincronizações simultâneas podiam se atropelar.
let syncQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = syncQueue.then(task, task);
  syncQueue = run.catch(() => undefined);
  return run;
}

/**
 * Envia os modelos para a nuvem sem apagar o que outros dispositivos criaram.
 * Só remove no servidor os modelos que este dispositivo excluiu de propósito
 * (`deletedIds`). Antes a sincronização apagava tudo que não estivesse na
 * lista local, o que fazia um computador limpar os modelos recém-criados em
 * outro.
 */
export async function syncTemplatesToCloud(
  userId: string,
  list: SavedTemplate[],
  deletedIds: string[] = [],
): Promise<void> {
  if (!supabase) return;
  const client = supabase;

  // Nunca persiste os modelos fixos (built-in) na nuvem.
  const persistable = stripBuiltIns(list);

  await enqueue(async () => {
    if (persistable.length > 0) {
      const rows = persistable.map((t) => ({
        id: t.id,
        user_id: userId,
        name: t.name,
        shared: t.shared,
        updated_at: t.updatedAt,
      }));
      const { error: upsertError } = await client
        .from("templates")
        .upsert(rows, { onConflict: "id" });
      if (upsertError) throw upsertError;
    }

    const toDelete = deletedIds.filter((id) => !isBuiltInTemplateId(id));
    if (toDelete.length > 0) {
      const { error: deleteError } = await client.from("templates").delete().in("id", toDelete);
      if (deleteError) throw deleteError;
    }
  });
}

/**
 * Copia os modelos salvos localmente (localStorage) para a nuvem na primeira
 * vez que o usuário loga neste dispositivo — evita perder modelos criados
 * antes de existir login. Modelos com o mesmo nome já existente na nuvem são
 * ignorados (a versão da nuvem prevalece).
 */
export async function mergeLocalTemplatesIntoCloud(
  userId: string,
  localList: SavedTemplate[],
  cloudList: SavedTemplate[],
): Promise<SavedTemplate[]> {
  // Exclui built-ins de qualquer lado — nunca são gravados.
  const localUser = stripBuiltIns(localList);
  const cloudUser = stripBuiltIns(cloudList);
  if (!localUser.length) return withBuiltIns(cloudUser);
  const cloudNames = new Set(cloudUser.map((t) => t.name));
  const toAdd = localUser.filter((t) => !cloudNames.has(t.name));
  if (!toAdd.length) return withBuiltIns(cloudUser);
  const merged = [...toAdd, ...cloudUser];
  await syncTemplatesToCloud(userId, merged);
  return withBuiltIns(merged);
}

export function loadTemplates(): SavedTemplate[] {
  if (typeof window === "undefined") return withBuiltIns([]);
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return withBuiltIns([]);
    const parsed = JSON.parse(raw) as SavedTemplate[];
    if (!Array.isArray(parsed)) return withBuiltIns([]);
    const userOnly = stripBuiltIns(
      parsed.map((t) => ({ ...t, shared: normalizeShared(t.shared) })),
    );
    return withBuiltIns(userOnly);
  } catch {
    return withBuiltIns([]);
  }
}

export function saveTemplates(list: SavedTemplate[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    // Só o que o usuário criou vai para o localStorage.
    window.localStorage.setItem(KEY, JSON.stringify(stripBuiltIns(list)));
    return true;
  } catch (err) {
    // Quota excedida, modo privado (Safari), armazenamento bloqueado por
    // iframe (comum em pré-visualizações embutidas), etc. Antes isso lançava
    // sem aviso e o app "esquecia" de salvar sem o usuário perceber.
    console.error("Falha ao salvar modelos no localStorage:", err);
    return false;
  }
}

export function upsertTemplate(list: SavedTemplate[], tpl: SavedTemplate): SavedTemplate[] {
  const idx = list.findIndex((t) => t.id === tpl.id);
  const next = [...list];
  if (idx >= 0) next[idx] = tpl;
  else next.unshift(tpl);
  return next;
}

export function removeTemplate(list: SavedTemplate[], id: string): SavedTemplate[] {
  return list.filter((t) => t.id !== id);
}

export function newId(): string {
  return `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function duplicateTemplate(tpl: SavedTemplate): SavedTemplate {
  return {
    id: newId(),
    name: `${tpl.name} (cópia)`,
    shared: { ...tpl.shared },
    updatedAt: Date.now(),
  };
}

export function renameTemplate(list: SavedTemplate[], id: string, name: string): SavedTemplate[] {
  return list.map((t) => (t.id === id ? { ...t, name, updatedAt: Date.now() } : t));
}

export function exportTemplates(list: SavedTemplate[]): string {
  return JSON.stringify({ kind: "volga-cert-templates", version: 1, templates: list }, null, 2);
}

export function importTemplates(current: SavedTemplate[], json: string): SavedTemplate[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("JSON malformado");
  }

  let incoming: Partial<SavedTemplate>[] = [];
  if (Array.isArray(parsed)) {
    incoming = parsed as Partial<SavedTemplate>[];
  } else if (parsed && typeof parsed === "object") {
    const obj = parsed as { templates?: unknown; shared?: unknown; name?: unknown };
    if (Array.isArray(obj.templates)) {
      incoming = obj.templates as Partial<SavedTemplate>[];
    } else if (obj.shared && obj.name) {
      incoming = [obj as Partial<SavedTemplate>];
    }
  }

  if (!incoming.length) {
    throw new Error("nenhum modelo encontrado no arquivo");
  }

  const byName = new Map(current.map((t) => [t.name, t]));
  let next = [...current];
  for (const t of incoming) {
    if (!t || !t.shared || !t.name) continue;
    const exists = byName.get(t.name);
    if (exists) {
      if ((t.updatedAt || 0) > (exists.updatedAt || 0)) {
        next = next.map((x) =>
          x.id === exists.id
            ? { ...exists, shared: t.shared as SharedFields, updatedAt: t.updatedAt || Date.now() }
            : x,
        );
      }
    } else {
      next.unshift({
        id: t.id || newId(),
        name: t.name,
        shared: t.shared as SharedFields,
        updatedAt: t.updatedAt || Date.now(),
      });
    }
  }
  return next;
}
