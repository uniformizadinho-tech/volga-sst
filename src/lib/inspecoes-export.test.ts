import { describe, expect, it } from "vitest";
import type { Equipamento } from "./inspecoes";
import { equipamentosPendenciasParaCsv } from "./inspecoes-export";

describe("exportação CSV de inspeções", () => {
  it("neutraliza fórmulas nos campos controlados pelos usuários", () => {
    const equipamento: Equipamento = {
      id: "equip-1",
      codigo: "=2+2",
      tipo: "extintor",
      setor: "+SUM(1,1)",
      local: "Área A",
      ativo: true,
      pendencias: [
        {
          id: "pend-1",
          descricao: '@HYPERLINK("https://example.com")',
          nivel: "alto",
          acao: "-1+2",
          situacao: "aberta",
          responsavel: "\t=1+1",
          origem: "cadastro",
        },
      ],
    };

    const csv = equipamentosPendenciasParaCsv([equipamento]);

    expect(csv).toContain('"\'=2+2"');
    expect(csv).toContain('"\'+SUM(1,1)"');
    expect(csv).toContain("\"'@HYPERLINK");
    expect(csv).toContain('"\'\t=1+1"');
  });
});
