import { describe, expect, it } from "vitest";
import rows from "@/data/extintores-matriz.json";
import { equipamentosDaMatriz, lerPlanilhaMatriz, mesclarEquipamentos } from "./inspecoes-planilha";
import { utils, write } from "xlsx";

describe("planilha Matriz", () => {
  it("preserva todos os 47 registros e as informações do extintor ABC", () => {
    const items = equipamentosDaMatriz(rows);
    expect(items).toHaveLength(47);
    expect(items.find((e) => e.codigo === "MATRIZ-003")).toMatchObject({
      tipo: "extintor",
      classe: "ABC",
      setor: "1º Andar",
      local: "Área de dobra",
      levantamento: {
        status: "Pendente",
        prioridade: "Média",
        acao: "Incluir extintor ABC no projeto de segurança (código BC)",
      },
    });
  });
  it("preserva iluminação e hidrantes sem inventar datas de validade", () => {
    const items = equipamentosDaMatriz(rows);
    expect(items[0]?.tipo).toBe("iluminacao");
    expect(items.every((e) => e.vencRecarga === undefined && e.vencTesteHidro === undefined)).toBe(
      true,
    );
    expect(items.find((e) => e.codigo === "MATRIZ-037")).toMatchObject({
      tipo: "hidrante",
      levantamento: { prioridade: "Alta" },
    });
  });
  it("lê Excel com títulos antes do cabeçalho e linhas vazias ao final", async () => {
    const book = utils.book_new();
    utils.book_append_sheet(
      book,
      utils.aoa_to_sheet([
        ["Controle de Equipamentos"],
        ["Empresa: Matriz"],
        ["ID", "Andar", "Localização / Setor", "Item / Equipamento"],
        ...rows,
        [],
      ]),
      "Controle",
    );
    const items = await lerPlanilhaMatriz(write(book, { type: "array", bookType: "xlsx" }));
    expect(items).toHaveLength(47);
    expect(items[0]?.codigo).toBe("MATRIZ-001");
  });
  it("reimportação mantém IDs, vencimentos e histórico sem duplicar", () => {
    const items = equipamentosDaMatriz(rows);
    const first = items[0];
    if (!first) throw new Error("Missing first row");
    const db = {
      equipamentos: [{ ...first, id: "original", vencRecarga: "2027-01-01" }],
      inspecoes: [
        {
          id: "inspection",
          equipamentoId: "original",
          data: "2026-10-09",
          inspetor: "Ana",
          respostas: {},
          observacao: "",
        },
      ],
    };
    const merged = mesclarEquipamentos(db, items);
    const repeated = mesclarEquipamentos(merged, equipamentosDaMatriz(rows));
    expect(repeated.equipamentos).toHaveLength(47);
    expect(repeated.equipamentos[0]).toMatchObject({ id: "original", vencRecarga: "2027-01-01" });
    expect(repeated.inspecoes).toEqual(db.inspecoes);
  });
});
