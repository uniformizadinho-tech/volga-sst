import { describe, expect, it } from "vitest";
import { parseEstoqueCatalogoFile, parseEstoqueInt, parsePrecoBr } from "./estoque-io";

function fileFromText(content: string): File {
  const file = new File([content], "catalogo.csv", { type: "text/csv" });
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => new TextEncoder().encode(content).buffer,
  });
  return file;
}

describe("importação segura do catálogo de estoque", () => {
  it("não trunca nem inventa zero para quantidades inválidas", () => {
    expect(parseEstoqueInt("12")).toBe(12);
    expect(parseEstoqueInt("1.234")).toBe(1234);
    expect(parseEstoqueInt("0")).toBe(0);
    expect(parseEstoqueInt("12abc")).toBeNull();
    expect(parseEstoqueInt("4,5")).toBeNull();
    expect(parseEstoqueInt("")).toBeNull();
    expect(parseEstoqueInt("-1")).toBeNull();
  });

  it("interpreta preço BR e rejeita prefixos parcialmente numéricos", () => {
    expect(parsePrecoBr("R$ 1.234,56")).toBe(1234.56);
    expect(parsePrecoBr("12,5")).toBe(12.5);
    expect(parsePrecoBr("12.34")).toBe(12.34);
    expect(parsePrecoBr("1.234")).toBe(1234);
    expect(parsePrecoBr("12abc")).toBeNull();
  });

  it("ignora linhas com estoque inválido e avisa quando o preço é inválido", async () => {
    const csv = [
      "SKU;ITEM;ESTOQUE_GERAL;ULT_PRECO;COD_BARRAS",
      "A1;Luva;12abc;5,00;100",
      "B2;Bota;12;R$ 1.234,56;200",
      "C3;Capacete;0;preço;300",
    ].join("\n");
    const file = fileFromText(csv);

    const result = await parseEstoqueCatalogoFile(file);

    expect(result.linhasLidas).toBe(3);
    expect(result.linhasValidas).toBe(2);
    expect(result.itens.map((item) => item.codBarras)).toEqual(["200", "300"]);
    expect(result.itens[0]).toMatchObject({ estoqueSistema: 12, preco: 1234.56 });
    expect(result.itens[1]).toMatchObject({ estoqueSistema: 0, preco: null });
    expect(
      result.warnings.some((warning) =>
        warning.includes("quantidade de estoque ausente ou inválida"),
      ),
    ).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("preço inválido"))).toBe(true);
  });

  it("recusa catálogo sem coluna-base de estoque", async () => {
    const file = fileFromText("SKU;ITEM;COD_BARRAS\nA1;Luva;100");
    await expect(parseEstoqueCatalogoFile(file)).rejects.toThrow(
      /Coluna de estoque não encontrada/,
    );
  });
});
