import { beforeEach, describe, expect, it, vi } from "vitest";

const { saveSharedSnapshot } = vi.hoisted(() => ({ saveSharedSnapshot: vi.fn() }));
vi.mock("@/lib/shared-kv", () => ({ saveSharedSnapshot }));

import { saveDB, type InspecoesDB } from "./inspecoes";

const KEY = "volga:inspecoes:v1";
const db: InspecoesDB = { equipamentos: [], inspecoes: [] };

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("persistência compartilhada de inspeções", () => {
  it("propaga conflito e não substitui o cache local antes da confirmação remota", async () => {
    const cached = JSON.stringify({ equipamentos: [{ id: "remoto" }], inspecoes: [] });
    localStorage.setItem(KEY, cached);
    saveSharedSnapshot.mockRejectedValue(
      new Error(
        "Outra pessoa atualizou este cadastro. Recarregue os dados antes de tentar novamente.",
      ),
    );

    await expect(saveDB(db)).rejects.toThrow(/Outra pessoa atualizou/);

    expect(localStorage.getItem(KEY)).toBe(cached);
    expect(saveSharedSnapshot).toHaveBeenCalledWith(KEY, JSON.stringify(db));
  });
});
