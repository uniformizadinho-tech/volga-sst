import { supabase } from "./supabase";
import { compareLockers, slotKey, type Locker } from "./lockers-domain";

export type { Locker } from "./lockers-domain";
export { parseNumeroLocalizacao } from "./lockers-domain";

const CACHE_KEY = "volga:lockers-cache:v1";
const BATCH = 200;

interface LockerRow {
  id: string;
  vestiario: string;
  localizacao: string;
  numero: string;
  ocupante: string | null;
  setor: string | null;
  situacao: string | null;
  updated_at: number | string;
  locker_number?: string;
  location?: string | null;
  employee_name?: string | null;
}

function rowToLocker(row: LockerRow): Locker {
  return {
    id: row.id,
    vestiario: row.vestiario ?? "",
    localizacao: row.localizacao ?? "",
    numero: row.numero ?? "",
    ocupante: row.ocupante ?? "",
    setor: row.setor ?? "",
    situacao: row.situacao ?? "",
    updatedAt:
      typeof row.updated_at === "number"
        ? row.updated_at
        : Date.parse(String(row.updated_at)) || Number(row.updated_at) || 0,
  };
}

function lockerToRow(l: Locker): LockerRow {
  return {
    id: l.id,
    vestiario: l.vestiario,
    localizacao: l.localizacao,
    numero: l.numero,
    ocupante: l.ocupante || null,
    setor: l.setor || null,
    situacao: l.situacao || null,
    updated_at: new Date(l.updatedAt || Date.now()).toISOString(),
    // colunas legadas que ainda existem (e são obrigatórias) na tabela da nuvem
    locker_number: l.numero,
    location: l.localizacao || null,
    employee_name: l.ocupante || null,
  };
}

/**
 * Traduz erros do banco para mensagens que o usuário entende e sabe resolver.
 * Antes a tela exibia o texto cru do Postgres ("duplicate key value violates
 * unique constraint lockers_vestiario_localizacao_numero_key").
 */
export function describeLockerError(
  err: unknown,
  fallback = "Não foi possível concluir a operação.",
): string {
  const e = (err ?? {}) as { code?: string; message?: string; status?: number };
  const msg = (e.message ?? "").toLowerCase();
  if (e.code === "23505" || msg.includes("duplicate key")) {
    return "Já existe um armário com esse número nesse vestiário/local.";
  }
  if (
    e.code === "42501" ||
    msg.includes("row-level security") ||
    e.status === 401 ||
    e.status === 403
  ) {
    return "Sem permissão para gravar. Sua sessão pode ter expirado — entre novamente.";
  }
  if (e.code === "42P01" || (msg.includes("relation") && msg.includes("does not exist"))) {
    return "A tabela de armários não existe na nuvem. Rode a migration 0002_lockers.sql no Supabase.";
  }
  if (msg.includes("failed to fetch") || msg.includes("network")) {
    return "Sem conexão com a nuvem. Verifique a internet e tente novamente.";
  }
  return fallback;
}

/** Cache local só para pintar a tela instantaneamente antes da nuvem responder.
 *  A nuvem é a fonte de verdade — isto nunca é usado para decidir merge. */
export function loadLockersCache(): Locker[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (l): l is Locker => !!l && typeof l === "object" && typeof (l as Locker).id === "string",
      )
      .map((l) => ({
        id: l.id,
        vestiario: String(l.vestiario ?? ""),
        localizacao: String(l.localizacao ?? ""),
        numero: String(l.numero ?? ""),
        ocupante: String(l.ocupante ?? ""),
        setor: String(l.setor ?? ""),
        situacao: String(l.situacao ?? ""),
        updatedAt: Number(l.updatedAt) || 0,
      }));
  } catch {
    return [];
  }
}

export function saveLockersCache(list: Locker[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(list));
  } catch {
    // cache best-effort — se falhar, a tela continua funcionando via nuvem
  }
}

export function clearLockersCache(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}

function requireCloud() {
  if (!supabase) throw new Error("Nuvem não configurada.");
  return supabase;
}

export async function loadLockersCloud(): Promise<Locker[]> {
  const db = requireCloud();
  const all: Locker[] = [];
  // paginação explícita: o PostgREST corta em 1000 linhas por padrão
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("lockers")
      .select("id, vestiario, localizacao, numero, ocupante, setor, situacao, updated_at")
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    const rows = (data as LockerRow[]) ?? [];
    all.push(...rows.map(rowToLocker));
    if (rows.length < 1000) break;
  }
  return all.sort(compareLockers);
}

export async function upsertLockerCloud(locker: Locker): Promise<void> {
  await bulkUpsertLockersCloud([locker]);
}

export async function bulkUpsertLockersCloud(list: Locker[]): Promise<void> {
  if (!list.length) return;
  const db = requireCloud();
  const rows = list.map(lockerToRow);
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db
      .from("lockers")
      .upsert(rows.slice(i, i + BATCH), { onConflict: "id" });
    if (error) throw error;
  }
}

export async function removeLockerCloud(id: string): Promise<void> {
  await removeLockersCloud([id]);
}

/** Exclusão em lote numa única requisição por bloco (antes: 1 requisição por armário). */
export async function removeLockersCloud(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = requireCloud();
  for (let i = 0; i < ids.length; i += BATCH) {
    const { error } = await db
      .from("lockers")
      .delete()
      .in("id", ids.slice(i, i + BATCH));
    if (error) throw error;
  }
}

export function newLockerId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // fallback RFC4122 v4 — a coluna id é uuid, então o formato precisa ser válido
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Mantido por compatibilidade — a importação nova usa `planImport` (lockers-domain). */
export function reconcileImportedLockers(parsed: Locker[], existing: Locker[]): Locker[] {
  const existingByKey = new Map(existing.map((l) => [slotKey(l), l]));
  return parsed.map((l) => {
    const match = existingByKey.get(slotKey(l));
    return match ? { ...l, id: match.id } : l;
  });
}

export function upsertLocker(list: Locker[], locker: Locker): Locker[] {
  const idx = list.findIndex((l) => l.id === locker.id);
  if (idx >= 0) {
    const next = [...list];
    next[idx] = locker;
    return next;
  }
  return [...list, locker].sort(compareLockers);
}

export function removeLocker(list: Locker[], id: string): Locker[] {
  return list.filter((l) => l.id !== id);
}

export interface LockerHistoryEntry {
  id: number;
  locker_id: string;
  acao: "INSERT" | "UPDATE" | "DELETE";
  antes: Partial<LockerRow> | null;
  depois: Partial<LockerRow> | null;
  usuario_email: string | null;
  created_at: string;
}

/** Histórico gravado por gatilho no banco (tabela lockers_historico). */
export async function loadLockerHistory(limit = 500): Promise<LockerHistoryEntry[]> {
  const db = requireCloud();
  const { data, error } = await db
    .from("lockers_historico")
    .select("id, locker_id, acao, antes, depois, usuario_email, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as LockerHistoryEntry[]) ?? [];
}

/** Avisa quando qualquer pessoa altera um armário. Devolve a função para parar. */
export function subscribeLockers(onChange: () => void): () => void {
  const db = requireCloud();
  const channel = db
    .channel("lockers-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "lockers" }, () => onChange())
    .subscribe();
  return () => {
    void db.removeChannel(channel);
  };
}
