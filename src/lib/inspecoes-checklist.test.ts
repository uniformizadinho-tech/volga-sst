import { describe, expect, it } from "vitest";
import {
  checklistPara,
  respostasIniciais,
  validarInspecao,
  naoConformidadesAbertas,
} from "./inspecoes-checklist";
import {
  diasAte,
  resumoMes,
  statusVencimento,
  type Equipamento,
  type Inspecao,
  type Resposta,
} from "./inspecoes";

const eq: Equipamento = {
  id: "ex",
  codigo: "EX-001",
  tipo: "extintor",
  setor: "Produção",
  local: "Porta",
  ativo: true,
  classe: "ABC",
};
const registro = (extra: Partial<Inspecao> = {}): Inspecao => ({
  id: "i",
  equipamentoId: eq.id,
  data: "2026-10-09",
  inspetor: "Ana",
  respostas: Object.fromEntries(checklistPara(eq).map((i) => [i.titulo, "ok" as Resposta])),
  observacao: "",
  ...extra,
});

describe("checklist e acompanhamento", () => {
  it("não inicia os itens como conformes", () => {
    const i = registro({ respostas: respostasIniciais() });
    expect(Object.keys(i.respostas)).toHaveLength(0);
    expect(validarInspecao(eq, i, "2026-10-09")).not.toBeNull();
  });
  it("exige resposta em todos os itens", () => {
    const i = registro();
    delete i.respostas["Lacre intacto"];
    expect(validarInspecao(eq, i, "2026-10-09")).not.toBeNull();
    i.respostas["Lacre intacto"] = "ok";
    expect(validarInspecao(eq, i, "2026-10-09")).toBeNull();
  });
  it("CO2 não exige manômetro, ABC exige", () => {
    expect(
      checklistPara({ ...eq, classe: "CO₂" }).some((i) => i.titulo.includes("Manômetro")),
    ).toBe(false);
    expect(checklistPara(eq).some((i) => i.titulo.includes("Manômetro"))).toBe(true);
  });
  it("NC exige descrição, ação, responsável e prazo", () => {
    const i = registro({
      observacao: "Lacre rompido",
      acaoCorretiva: "Encaminhar à manutenção",
      responsavel: "João",
      prazo: "2026-10-10",
    });
    i.respostas["Lacre intacto"] = "nc";
    expect(validarInspecao(eq, i, "2026-10-09")).toBeNull();
    for (const field of ["observacao", "acaoCorretiva", "responsavel", "prazo"] as const) {
      expect(validarInspecao(eq, { ...i, [field]: "" }, "2026-10-09")).not.toBeNull();
    }
  });
  it("não aceita inspeção futura", () => {
    expect(validarInspecao(eq, registro({ data: "2026-10-10" }), "2026-10-09")).not.toBeNull();
  });
  it("prazo de correção não antecede inspeção", () => {
    const i = registro({
      observacao: "Lacre rompido",
      acaoCorretiva: "Manutenção",
      responsavel: "João",
      prazo: "2026-10-08",
    });
    i.respostas["Lacre intacto"] = "nc";
    expect(validarInspecao(eq, i, "2026-10-09")).not.toBeNull();
  });
  it("validade incompleta fica a conferir mesmo com recarga futura", () => {
    expect(statusVencimento({ ...eq, vencRecarga: "2027-10-09" }, new Date(2026, 9, 9))).toBe(
      "sem",
    );
    expect(statusVencimento({ ...eq, vencRecarga: "2026-10-20" }, new Date(2026, 9, 9))).toBe(
      "sem",
    );
    expect(statusVencimento({ ...eq, vencRecarga: "2026-10-08" }, new Date(2026, 9, 9))).toBe(
      "vencido",
    );
  });
  it("não interpreta data impossível como uma data válida", () => {
    expect(diasAte("2026-02-30", new Date(2026, 1, 1))).toBeNull();
  });
  it("nova inspeção conforme não apaga NC anterior sem baixa", () => {
    const anterior = registro({ id: "anterior", respostas: { Lacre: "nc" }, data: "2026-10-08" });
    const db = { equipamentos: [eq], inspecoes: [anterior, registro()] };
    expect(naoConformidadesAbertas(db, eq.id).map((i) => i.id)).toEqual(["anterior"]);
    expect(resumoMes(db, "2026-10").naoConformes).toBe(1);
    anterior.corrigidoEm = "2026-10-09";
    expect(naoConformidadesAbertas(db, eq.id)).toHaveLength(0);
    expect(resumoMes(db, "2026-10").naoConformes).toBe(0);
  });
  it("calcula vencimentos com a data de referência recebida", () => {
    const equipamento = { ...eq, vencRecarga: "2026-02-01", vencTesteHidro: "2027-02-01" };
    const db = { equipamentos: [equipamento], inspecoes: [] };
    expect(resumoMes(db, "2026-01", new Date(2026, 0, 1)).vencidos).toBe(0);
    expect(resumoMes(db, "2026-03", new Date(2026, 2, 1)).vencidos).toBe(1);
  });
});
