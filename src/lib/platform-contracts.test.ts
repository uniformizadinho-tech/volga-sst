import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBackup, parseBackup, planArrayMerge } from "./backup";
import { can, explainDenied } from "./permissions";
import { pendingAuditEvents, recordOperation } from "./operation-audit";
import { createFullLocalBackup, restoreLocalState, stateFromBackup } from "./backup-snapshot";

describe("contratos da plataforma", () => {
  beforeEach(() => localStorage.clear());

  it("cria e valida backup com checksum e rejeita alteração", () => {
    const backup = createBackup({ estoque: [{ id: "1" }] });
    expect(parseBackup(backup).dados).toEqual({ estoque: [{ id: "1" }] });
    expect(() => parseBackup({ ...backup, dados: { estoque: [] } })).toThrow(/corrompido/);
  });

  it("planeja merge por identificador sem duplicar registros iguais", () => {
    expect(
      planArrayMerge(
        [{ id: "1", nome: "Ana" }],
        [
          { id: "1", nome: "Bia" },
          { id: "2", nome: "Caio" },
        ],
        "id",
      ),
    ).toEqual({ novos: 1, atualizados: 1, conflitos: 1, ignorados: 0 });
  });

  it("centraliza permissões e explica bloqueios", () => {
    expect(can("almoxarifado", "estoque.write")).toBe(true);
    expect(can("almoxarifado", "estoque.delete")).toBe(false);
    expect(explainDenied("estoque.delete")).toMatch(/excluir/);
  });

  it("faz snapshot dos domínios locais sem incluir rascunho de edição", () => {
    localStorage.setItem("volga:inspecoes:v1", JSON.stringify({ equipamentos: [], inspecoes: [] }));
    localStorage.setItem("volga:cert-draft:v1", JSON.stringify({ segredo: "não exportar" }));
    const backup = createFullLocalBackup(localStorage);
    const state = stateFromBackup(parseBackup(backup));
    expect(state["volga:inspecoes:v1"]).toEqual({ equipamentos: [], inspecoes: [] });
    expect(state["volga:cert-draft:v1"]).toBeUndefined();
    localStorage.clear();
    expect(restoreLocalState(state, localStorage)).toBe(1);
    expect(localStorage.getItem("volga:inspecoes:v1")).toContain("equipamentos");
  });

  it("retém auditoria quando não há backend", async () => {
    vi.resetModules();
    const event = await recordOperation({
      module: "SISTEMA",
      action: "TEST",
      result: "error",
      description: "Falha controlada",
    });
    expect(event.result).toBe("error");
    expect(pendingAuditEvents()).toHaveLength(1);
  });
});
