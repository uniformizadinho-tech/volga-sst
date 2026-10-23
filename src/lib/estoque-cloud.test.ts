import { describe, expect, it } from "vitest";
import { reconciliarItensEstoque, normalizarIdLancamento } from "./estoque-cloud";
import type { EstoqueItem } from "./estoque-store";
const item = (updatedAt: number, itemName = "Luva"): EstoqueItem => ({
  codBarras: "001",
  sku: "A",
  tipo: "EPI",
  item: itemName,
  cor: "Azul",
  tamanho: "M",
  estoqueSistema: 3,
  preco: null,
  updatedAt,
});
describe("sincronização de estoque", () => {
  it("mantém alterações locais mais recentes e importa registros ausentes", () => {
    const result = reconciliarItensEstoque(
      [item(20, "Local novo"), { ...item(1), codBarras: "002" }],
      [item(10, "Nuvem antiga")],
    );
    expect(result.itens.map((x) => x.item)).toEqual(["Local novo", "Luva"]);
    expect(result.paraEnviar.map((x) => x.codBarras)).toEqual(["001", "002"]);
  });
  it("prefere nuvem em caso de empate de timestamp e ao receber versão mais nova", () => {
    expect(reconciliarItensEstoque([item(10, "Local")], [item(10, "Nuvem")]).itens[0].item).toBe(
      "Nuvem",
    );
    expect(reconciliarItensEstoque([item(5, "Antigo")], [item(10, "Novo")]).itens[0].item).toBe(
      "Novo",
    );
  });
  it("normaliza IDs de eventos legados para UUID determinístico", () => {
    const a = normalizarIdLancamento("legacy-event-1");
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(normalizarIdLancamento("legacy-event-1")).toBe(a);
    expect(normalizarIdLancamento("123e4567-e89b-42d3-a456-426614174000")).toBe(
      "123e4567-e89b-42d3-a456-426614174000",
    );
  });
});
