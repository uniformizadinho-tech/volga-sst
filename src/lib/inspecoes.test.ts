import { describe, expect, it } from "vitest";
import {
  equipamentosFromCSV,
  resumoMes,
  statusVencimento,
  type Equipamento,
  type InspecoesDB,
} from "./inspecoes";

const eq = (id: string, extra: Partial<Equipamento> = {}): Equipamento => ({
  id,
  codigo: id,
  tipo: "extintor",
  setor: "Produção",
  local: "",
  ativo: true,
  ...extra,
});
const hoje = new Date(2026, 9, 9);

describe("inspeções", () => {
  it("vencido quando a recarga já passou", () => {
    expect(statusVencimento(eq("a", { vencRecarga: "2026-10-01" }), hoje)).toBe("vencido");
  });
  it("vence em até 30 dias", () => {
    expect(
      statusVencimento(eq("a", { vencRecarga: "2026-11-05", vencTesteHidro: "2027-11-05" }), hoje),
    ).toBe("vence30");
  });
  it("cobertura conta só equipamentos ativos inspecionados no mês", () => {
    const db: InspecoesDB = {
      equipamentos: [eq("a"), eq("b"), eq("c", { ativo: false })],
      inspecoes: [
        {
          id: "1",
          equipamentoId: "a",
          data: "2026-10-02",
          inspetor: "x",
          respostas: { Lacre: "nc" },
          observacao: "",
        },
      ],
    };
    const r = resumoMes(db, "2026-10");
    expect(r.cobertura).toBe(50);
    expect(r.naoConformes).toBe(1);
  });
  it("NC corrigida não conta como aberta", () => {
    const db: InspecoesDB = {
      equipamentos: [eq("a")],
      inspecoes: [
        {
          id: "1",
          equipamentoId: "a",
          data: "2026-10-02",
          inspetor: "x",
          respostas: { Lacre: "nc" },
          observacao: "",
          corrigidoEm: "2026-10-05",
        },
      ],
    };
    expect(resumoMes(db, "2026-10").naoConformes).toBe(0);
  });
  it("importa CSV ignorando tipo inválido", () => {
    const r = equipamentosFromCSV("codigo;tipo;setor\nex-1;extintor;Produção\nX;foo;Produção");
    expect(r.map((e) => e.codigo)).toEqual(["EX-1"]);
  });
});
