import { beforeEach, describe, expect, it, vi } from "vitest";

/** Tabela app_shared_state em memória, com o mesmo encadeamento usado pelo código. */
const table = new Map<string, { value: string; updated_at: string }>();
let beforeWrite: (() => void) | null = null;

function fakeFrom() {
  const filters: Record<string, unknown> = {};
  let mode: "select" | "update" | "insert" = "select";
  let payload: { key?: string; value: string; updated_at: string } | null = null;
  const builder = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      filters[col] = val;
      return builder;
    },
    update: (p: typeof payload) => {
      mode = "update";
      payload = p;
      return builder;
    },
    insert: (p: typeof payload) => {
      mode = "insert";
      payload = p;
      return builder;
    },
    maybeSingle: async () => {
      if (mode !== "select" && beforeWrite) {
        const hook = beforeWrite;
        beforeWrite = null;
        hook();
      }
      if (mode === "select") {
        const row = table.get(filters.key as string);
        return { data: row ? { ...row } : null, error: null };
      }
      if (mode === "insert") {
        if (table.has(payload!.key!)) return { data: null, error: { code: "23505" } };
        table.set(payload!.key!, { value: payload!.value, updated_at: payload!.updated_at });
        return { data: { updated_at: payload!.updated_at }, error: null };
      }
      const row = table.get(filters.key as string);
      if (!row || row.updated_at !== filters.updated_at) return { data: null, error: null };
      table.set(filters.key as string, { value: payload!.value, updated_at: payload!.updated_at });
      return { data: { updated_at: payload!.updated_at }, error: null };
    },
  };
  return builder;
}

vi.mock("./supabase", () => ({ supabase: { from: () => fakeFrom() } }));
vi.mock("sonner", () => ({ toast: { warning: vi.fn(), error: vi.fn() } }));

import {
  addHistory,
  applyHistoryOps,
  loadHistory,
  pendingHistoryCount,
  removeHistory,
  syncHistory,
  type HistoryEntry,
} from "./history-store";

const KEY = "volga:cert-history:v1";
const entry = (id: string, createdAt: number): HistoryEntry =>
  ({ id, createdAt, shared: {}, cols: [] }) as unknown as HistoryEntry;
const remoteIds = () =>
  (JSON.parse(table.get(KEY)?.value ?? "[]") as HistoryEntry[]).map((h) => h.id);

describe("histórico de certificados compartilhado", () => {
  beforeEach(() => {
    localStorage.clear();
    table.clear();
    beforeWrite = null;
  });

  it("aplica operações sem duplicar e respeita a limpeza por data", () => {
    const base = [entry("a", 1), entry("b", 2)];
    const out = applyHistoryOps(base, [
      { type: "add", entry: entry("a", 1) },
      { type: "add", entry: entry("c", 5) },
      { type: "clear", at: 2 },
    ]);
    expect(out.map((h) => h.id)).toEqual(["c"]);
  });

  it("soma a emissão local com a de outra pessoa em vez de sobrescrever", async () => {
    table.set(KEY, { value: JSON.stringify([entry("colega", 10)]), updated_at: "2026-01-01" });
    addHistory({ shared: {} as never, cols: [] });
    await syncHistory();
    expect(remoteIds()).toHaveLength(2);
    expect(remoteIds()).toContain("colega");
    expect(pendingHistoryCount()).toBe(0);
    expect(loadHistory()).toHaveLength(2);
  });

  it("refaz a gravação quando alguém grava entre a leitura e a escrita", async () => {
    table.set(KEY, { value: "[]", updated_at: "2026-01-01" });
    beforeWrite = () =>
      table.set(KEY, {
        value: JSON.stringify([entry("concorrente", 3)]),
        updated_at: "2026-01-02",
      });
    addHistory({ shared: {} as never, cols: [] });
    await syncHistory();
    expect(remoteIds()).toContain("concorrente");
    expect(remoteIds()).toHaveLength(2);
  });

  it("remove somente o registro pedido, preservando os da equipe", async () => {
    table.set(KEY, {
      value: JSON.stringify([entry("x", 1), entry("y", 2)]),
      updated_at: "2026-01-01",
    });
    localStorage.setItem(KEY, JSON.stringify([entry("x", 1)]));
    removeHistory("x");
    await syncHistory();
    expect(remoteIds()).toEqual(["y"]);
  });
});
