import { describe, expect, it } from "vitest";
import { examFingerprint } from "./exames";
import { parseExamMatrix } from "./exames-import";

describe("importação de exames", () => {
  it("mapeia os cabeçalhos do relatório e calcula prazo quando a próxima data não veio", () => {
    const result = parseExamMatrix([
      [
        "Empresa",
        "Funcionário",
        "Tipo",
        "Fornecedor",
        "Local/Unidade de Atendimento",
        "Exame",
        "Tipo Específico",
        "Data",
        "Prazo Próximo",
        "Data Próximo",
        "Ordem",
      ],
      [
        "Volga",
        "Pessoa de teste",
        "Complementar",
        "Clínica de teste",
        "Unidade A",
        "Audiometria",
        "Periódico",
        "27/01/2026",
        "12 meses",
        "",
        "Ref. 01",
      ],
    ]);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      employeeName: "Pessoa de teste",
      examCategory: "Complementar",
      serviceLocation: "Unidade A",
      examName: "Audiometria",
      performedOn: "2026-01-27",
      validityMonths: 12,
      dueOn: "2027-01-27",
      dueDateOrigin: "calculado",
    });
    expect(result.rejected).toHaveLength(0);
  });

  it("prioriza a data de vencimento e preserva duplicatas legítimas com identidade estável", async () => {
    const table = [
      ["Empresa", "Funcionário", "Tipo", "Exame", "Data", "Prazo Próximo", "Data Próximo"],
      ["Volga", "Pessoa de teste", "Clínico", "Avaliação", "01/02/2026", "12 meses", "03/02/2027"],
      ["Volga", "Pessoa de teste", "Clínico", "Avaliação", "01/02/2026", "12 meses", "03/02/2027"],
    ];
    const result = parseExamMatrix(table);
    expect(result.records[0].dueOn).toBe("2027-02-03");
    expect(result.records[0].dueDateOrigin).toBe("importado");
    expect(result.duplicateCandidates).toBe(1);
    expect(result.records[0].sourceOccurrence).toBe(0);
    expect(result.records[1].sourceOccurrence).toBe(1);
    expect(await examFingerprint(result.records[0])).not.toBe(
      await examFingerprint(result.records[1]),
    );
  });

  it("informa número da linha e motivo, sem repetir valores pessoais", () => {
    const result = parseExamMatrix([
      ["Empresa", "Funcionário", "Exame", "Data"],
      ["Volga", "", "Audiometria", "data incorreta"],
    ]);
    expect(result.records).toHaveLength(0);
    expect(result.rejected[0]).toEqual({ row: 2, reason: "Nome do colaborador ausente." });
  });

  it("preserva um exame sem data realizada quando a fonte traz o vencimento", () => {
    const result = parseExamMatrix([
      ["Empresa", "Funcionário", "Exame", "Data", "Data Próximo"],
      ["Volga", "Pessoa de teste", "Avaliação", "", "01/02/2027"],
    ]);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      performedOn: "",
      dueOn: "2027-02-01",
      dueDateOrigin: "importado",
    });
    expect(result.missingPerformedDate).toBe(1);
    expect(result.rejected).toHaveLength(0);
  });

  it("contabiliza o exame sem data realizada nem vencimento calculável", () => {
    const result = parseExamMatrix([
      ["Empresa", "Funcionário", "Exame", "Data", "Prazo Próximo", "Data Próximo"],
      ["Volga", "Pessoa de teste", "Avaliação", "", "", ""],
    ]);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].dueOn).toBeNull();
    expect(result.withoutDueDate).toBe(1);
  });
});
