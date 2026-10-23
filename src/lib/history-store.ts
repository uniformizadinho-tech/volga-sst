import { toast } from "sonner";
import { updateSharedWithRetry } from "./shared-kv";
import type { Colaborador, SharedFields } from "./certificate-template";

const KEY = "volga:cert-history:v1";
/** Operações feitas neste navegador que ainda não foram confirmadas na nuvem. */
const PENDING_KEY = "volga:cert-history-pendente:v1";
/** Disparado quando o histórico local muda após sincronizar com a equipe. */
export const HISTORY_EVENT = "volga:cert-history-changed";
/**
 * O painel de Validades é calculado a partir deste histórico: se um registro sai daqui, o vencimento
 * dele SOME do painel. 50 era pouco (um lote com 19 modelos ocupava 19 posições). 500 cobre anos de
 * operação; se o navegador recusar por espaço, descartamos os mais antigos aos poucos em vez de perder tudo.
 */
export const HISTORY_MAX = 500;
const MAX = HISTORY_MAX;

export interface HistoryEntry {
  id: string;
  createdAt: number;
  templateName?: string;
  shared: SharedFields;
  cols: Colaborador[];
}

export type HistoryOp =
  | { type: "add"; entry: HistoryEntry }
  | { type: "remove"; id: string }
  | { type: "clear"; at: number };

function parseList(raw: string | null): HistoryEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return parseList(window.localStorage.getItem(KEY));
  } catch {
    return [];
  }
}

/**
 * Aplica operações sobre uma lista, sem duplicar registros. É usada tanto no cache local
 * quanto sobre a versão da nuvem, para que emissões simultâneas de pessoas diferentes
 * sejam somadas em vez de uma apagar a outra.
 */
export function applyHistoryOps(list: HistoryEntry[], ops: HistoryOp[]): HistoryEntry[] {
  let out = [...list];
  for (const op of ops) {
    if (op.type === "add") {
      if (!out.some((h) => h.id === op.entry.id)) out = [op.entry, ...out];
    } else if (op.type === "remove") {
      out = out.filter((h) => h.id !== op.id);
    } else {
      // Limpeza apaga apenas o que existia até aquele momento.
      out = out.filter((h) => h.createdAt > op.at);
    }
  }
  return out.sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX);
}

function loadPending(): HistoryOp[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PENDING_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? (parsed as HistoryOp[]) : [];
  } catch {
    return [];
  }
}

function savePending(ops: HistoryOp[]): void {
  try {
    if (ops.length) window.localStorage.setItem(PENDING_KEY, JSON.stringify(ops));
    else window.localStorage.removeItem(PENDING_KEY);
  } catch (error) {
    console.error("Histórico de certificados: não foi possível guardar a fila pendente.", error);
  }
}

/** Quantas alterações do histórico ainda aguardam confirmação da nuvem. */
export function pendingHistoryCount(): number {
  return loadPending().length;
}

/** Grava a lista no cache local; se faltar espaço, descarta os mais antigos aos poucos. */
function writeLocal(list: HistoryEntry[]): HistoryEntry[] {
  if (typeof window === "undefined") return list;
  let atual = list.slice(0, MAX);
  const alvo = atual.length;
  while (true) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(atual));
      if (atual.length < alvo) {
        console.warn(
          `Histórico de certificados: ${alvo - atual.length} registro(s) antigo(s) fora do cache local por falta de espaço.`,
        );
      }
      return atual;
    } catch {
      if (atual.length <= 1) break;
      atual = atual.slice(0, Math.max(1, Math.floor(atual.length * 0.9)));
    }
  }
  console.error("Histórico de certificados: o navegador recusou salvar o histórico.");
  return list.slice(0, MAX);
}

function notify(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(HISTORY_EVENT));
}

let syncing: Promise<boolean> | null = null;
let warned = false;

/**
 * Envia as operações pendentes para a nuvem, mesclando com o que a equipe já gravou.
 * Chamadas simultâneas compartilham o mesmo envio.
 */
export function syncHistory(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(true);
  if (syncing) return syncing;
  syncing = doSync().finally(() => {
    syncing = null;
  });
  return syncing;
}

async function doSync(): Promise<boolean> {
  const ops = loadPending();
  if (!ops.length) return true;
  try {
    const finalValue = await updateSharedWithRetry(KEY, (remote) =>
      JSON.stringify(applyHistoryOps(parseList(remote), ops)),
    );
    // Remove da fila só o que foi enviado; operações feitas durante o envio continuam.
    const sent = new Set(ops.map((op) => JSON.stringify(op)));
    const rest = loadPending().filter((op) => !sent.has(JSON.stringify(op)));
    savePending(rest);
    writeLocal(applyHistoryOps(parseList(finalValue), rest));
    warned = false;
    notify();
    if (rest.length) void syncHistory();
    return true;
  } catch (error) {
    console.error("Histórico de certificados: sincronização pendente.", error);
    if (!warned) {
      warned = true;
      toast.warning(
        "Histórico salvo neste navegador, mas ainda não sincronizado com a equipe. Tentaremos de novo automaticamente.",
      );
    }
    return false;
  }
}

/**
 * Depois de baixar a versão da equipe, reaplica no cache local o que ainda está pendente
 * (para nada sumir da tela) e tenta enviar.
 */
export function reconcileHistoryAfterPull(): void {
  const pending = loadPending();
  if (!pending.length) return;
  writeLocal(applyHistoryOps(loadHistory(), pending));
  void syncHistory();
}

function commit(op: HistoryOp): HistoryEntry[] {
  const list = writeLocal(applyHistoryOps(loadHistory(), [op]));
  savePending([...loadPending(), op]);
  void syncHistory();
  return list;
}

export function addHistory(entry: Omit<HistoryEntry, "id" | "createdAt">): HistoryEntry[] {
  const item: HistoryEntry = {
    ...entry,
    id: `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: Date.now(),
  };
  return commit({ type: "add", entry: item });
}

export function removeHistory(id: string): HistoryEntry[] {
  return commit({ type: "remove", id });
}

export function clearHistory(): HistoryEntry[] {
  return commit({ type: "clear", at: Date.now() });
}
