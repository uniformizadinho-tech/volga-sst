import { describe, expect, it } from "vitest";
import { importReportCsv, lockersToCsv } from "./lockers-io";
import type { ImportPlan, Locker } from "./lockers-domain";
import { parseNumeroLocalizacao } from "./lockers-store";

describe("lockers-io", () => {
  it("extrai número", () => {
    const { numero } = parseNumeroLocalizacao("229 (Vestiario)");
    expect(numero).toBe("229");
  });

  it("neutraliza fórmulas em dados exportados e avisos de importação", () => {
    const locker: Locker = {
      id: "locker-1",
      vestiario: "Masculino",
      localizacao: "Vestiário",
      numero: "229",
      ocupante: '=HYPERLINK("https://example.com")',
      setor: "PRODUÇÃO",
      situacao: "",
      updatedAt: 0,
    };
    const plan: ImportPlan = {
      novos: [],
      atualizados: [],
      semAlteracao: 0,
      conflitosArquivo: [],
      ocupantesDuplicados: [],
    };

    expect(lockersToCsv([locker])).toContain("'=HYPERLINK");
    expect(importReportCsv(plan, ['=HYPERLINK("https://example.com")'])).toContain("'=HYPERLINK");
  });
});
