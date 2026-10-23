import { describe, expect, it } from "vitest";
import {
  addMonthsToIsoDate,
  emptyExamDraft,
  examFingerprint,
  examStatus,
  parseExamDate,
  parseValidityMonths,
  validateExamDraft,
} from "./exames";

describe("domínio de exames ocupacionais", () => {
  it("normaliza datas brasileiras e rejeita datas impossíveis", () => {
    expect(parseExamDate("27/01/2026")).toBe("2026-01-27");
    expect(parseExamDate("2026-01-27")).toBe("2026-01-27");
    expect(parseExamDate("31/02/2026")).toBeNull();
  });

  it("interpreta períodos em meses e anos", () => {
    expect(parseValidityMonths("12 meses")).toBe(12);
    expect(parseValidityMonths("2 anos")).toBe(24);
    expect(parseValidityMonths(6)).toBe(6);
    expect(parseValidityMonths("sem prazo")).toBeNull();
  });

  it("calcula o vencimento sem avançar um dia em meses curtos", () => {
    expect(addMonthsToIsoDate("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonthsToIsoDate("2026-11-15", 12)).toBe("2027-11-15");
  });

  it("classifica vencido, atenção, em dia e sem prazo", () => {
    expect(examStatus("2026-06-30", "2026-07-01")).toBe("vencido");
    expect(examStatus("2026-07-31", "2026-07-01")).toBe("atencao");
    expect(examStatus("2026-09-01", "2026-07-01")).toBe("em_dia");
    expect(examStatus(null, "2026-07-01")).toBe("sem_prazo");
  });

  it("valida os campos administrativos obrigatórios", () => {
    expect(validateExamDraft(emptyExamDraft())).toContain("Informe o nome do colaborador.");
    const draft = {
      ...emptyExamDraft(),
      employeeName: "Pessoa de teste",
      examName: "Avaliação ocupacional",
      performedOn: "2026-06-01",
    };
    expect(validateExamDraft(draft)).toEqual([]);
  });

  it("gera uma impressão digital estável para evitar duplicar importações", async () => {
    const draft = {
      ...emptyExamDraft(),
      employeeName: "Pessoa de teste",
      examName: "Exame de teste",
      performedOn: "2026-06-01",
    };
    expect(await examFingerprint(draft)).toBe(
      await examFingerprint({ ...draft, employeeName: " Pessoa de teste " }),
    );
  });
});
