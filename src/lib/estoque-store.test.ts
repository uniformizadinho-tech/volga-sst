import { describe, expect, it } from "vitest";
import {
  mesclarCatalogoImportado,
  novoLancamento,
  somarContagemPorCodigo,
  validarBackupContagem,
  type EstoqueItem,
} from "./estoque-store";

const item: EstoqueItem = {
  codBarras: "123",
  tipo: "EPI",
  sku: "A1",
  item: "Luva",
  cor: "Azul",
  tamanho: "M",
  estoqueSistema: 5,
  preco: 10,
  updatedAt: 1,
};

describe("contagem segura", () => {
  it("distingue pendente de conferido com zero e mantém correções no histórico", () => {
    const eventos = [novoLancamento("123", 3), novoLancamento("123", -3, "correcao")];
    const totais = somarContagemPorCodigo(eventos);
    expect(totais.has("123")).toBe(true);
    expect(totais.get("123")).toBe(0);
    expect(eventos).toHaveLength(2);
    expect(somarContagemPorCodigo([novoLancamento("123", 0, "conferencia")]).has("123")).toBe(true);
  });
  it("não duplica produto nem altera data quando reimportado sem mudanças", () => {
    const result = mesclarCatalogoImportado([item], [{ ...item, updatedAt: 99 }]);
    expect(result).toMatchObject({ novos: 0, atualizados: 0, semAlteracao: 1 });
    expect(result.resultado).toEqual([item]);
  });
  it("rejeita backups com código repetido e lançamentos órfãos", () => {
    const base = { tipo: "volga-contagem-backup", versao: 1, itens: [item], lancamentos: [] };
    expect(validarBackupContagem(base)).toEqual({ itens: [item], lancamentos: [] });
    expect(() => validarBackupContagem({ ...base, itens: [item, item] })).toThrow();
    expect(() =>
      validarBackupContagem({ ...base, lancamentos: [novoLancamento("inexistente", 1)] }),
    ).toThrow();
  });
});
