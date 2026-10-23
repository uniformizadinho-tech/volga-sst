import { describe, expect, it } from "vitest";
import {
  addMonths,
  buildValidadeRows,
  chavePessoa,
  chaveTrilha,
  projetarVencimentos,
  resumirValidades,
  validadesParaCsv,
} from "./validity";
import type { HistoryEntry } from "./history-store";

function entry(
  id: string,
  createdAt: number,
  data: string,
  nome: string,
  cpf = "",
  meses = 12,
  normaRef = "Nº 35",
): HistoryEntry {
  return {
    id,
    createdAt,
    shared: {
      data,
      validadeMeses: meses,
      normaRef,
      treinamento: "NR 35",
    } as HistoryEntry["shared"],
    cols: [{ nome, cpf }],
  };
}
const HOJE = new Date(2026, 9, 3);

describe("addMonths", () => {
  it("não estoura o mês (31/01 + 1 = 28/02)", () => {
    expect(addMonths(new Date(2026, 0, 31), 1).getMonth()).toBe(1);
    expect(addMonths(new Date(2026, 0, 31), 1).getDate()).toBe(28);
  });
  it("respeita ano bissexto e virada de ano", () => {
    expect(addMonths(new Date(2024, 0, 31), 1).getDate()).toBe(29);
    const d = addMonths(new Date(2026, 10, 15), 3);
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2027, 1, 15]);
  });
});

describe("chavePessoa", () => {
  it("unifica CPF formatado e sem máscara", () => {
    expect(chavePessoa("A", "123.456.789-09")).toBe(chavePessoa("B", "12345678909"));
  });
  it("unifica nome com acento/caixa/espaços quando não há CPF", () => {
    expect(chavePessoa("João  Silva", "")).toBe(chavePessoa("JOAO SILVA", ""));
  });
});

describe("buildValidadeRows", () => {
  it("classifica vencido / atenção / ok", () => {
    const rows = buildValidadeRows(
      [
        entry("a", 1, "01/01/2025", "Ana"), // vence 01/01/2026 -> vencido
        entry("b", 2, "15/10/2025", "Bia"), // vence 15/10/2026 -> 12 dias -> atenção
        entry("c", 3, "01/09/2026", "Caio"), // ok
      ],
      HOJE,
    );
    const st = Object.fromEntries(rows.map((r) => [r.nome, r.status]));
    expect(st).toEqual({ Ana: "vencido", Bia: "atencao", Caio: "ok" });
  });
  it("janela de atenção é configurável", () => {
    const h = [entry("b", 2, "15/12/2025", "Bia")]; // vence 15/12/2026 = 73 dias
    expect(buildValidadeRows(h, HOJE)[0].status).toBe("ok");
    expect(buildValidadeRows(h, HOJE, { janelaAtencaoDias: 90 })[0].status).toBe("atencao");
  });
  it("mantém só a reciclagem mais recente, mesmo cadastrada fora de ordem", () => {
    const rows = buildValidadeRows(
      [
        entry("novo", 1, "01/09/2026", "Ana", "123.456.789-09"),
        entry("velho", 99, "01/01/2024", "ANA", "12345678909"), // registrado depois, mas data antiga
      ],
      HOJE,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].historyId).toBe("novo");
    expect(rows[0].status).toBe("ok");
  });
  it("ignora colaboradores excluídos e sem nome", () => {
    const e = entry("a", 1, "01/09/2026", "Ana");
    e.cols.push({ nome: "", cpf: "" }, { nome: "Zé", cpf: "", incluir: false });
    expect(buildValidadeRows([e], HOJE)).toHaveLength(1);
  });
  it("sem prazo => indefinido", () => {
    expect(
      buildValidadeRows([entry("a", 1, "01/09/2026", "Ana", "", 0, "Nº 06")], HOJE)[0].status,
    ).toBe("indefinido");
  });
});

describe("resumo e CSV", () => {
  const rows = buildValidadeRows(
    [
      entry("a", 1, "01/01/2025", "Ana"),
      entry("b", 2, "15/10/2025", "=Bia"),
      entry("c", 3, "01/09/2026", "Caio"),
    ],
    HOJE,
  );
  it("calcula conformidade", () => {
    const r = resumirValidades(rows);
    expect(r.total).toBe(3);
    expect(r.porStatus.vencido).toBe(1);
    expect(r.conformidadePct).toBe(66.7);
    expect(r.porNr[0].nr).toBe("NR-35");
  });
  it("CSV só lista pendências e neutraliza fórmulas", () => {
    const csv = validadesParaCsv(rows);
    expect(csv.split("\r\n")).toHaveLength(3);
    expect(csv.includes('"\'=Bia"')).toBe(true);
    expect(csv.includes("Caio")).toBe(false);
  });
});

function emissao(
  id: string,
  data: string,
  treinamento: string,
  normaRef: string,
  cols: { nome: string; cpf: string }[],
  meses = 24,
): HistoryEntry {
  return {
    id,
    createdAt: Number(id.replace(/\D/g, "")) || 1,
    shared: { data, validadeMeses: meses, normaRef, treinamento } as HistoryEntry["shared"],
    cols,
  };
}

describe("trilha de treinamento (reciclagem substitui o curso inicial)", () => {
  const BASICO = "NR10 (Básico) – Segurança em Instalações e Serviços em Eletricidade";
  const RECICL = "NR10 (Básico) Reciclagem – Segurança em Instalações e Serviços em Eletricidade";
  it("curso inicial e reciclagem são a mesma trilha", () => {
    expect(chaveTrilha(BASICO, "Nº 10")).toBe(chaveTrilha(RECICL, "Nº 10"));
  });
  it("treinamentos diferentes da mesma NR continuam separados", () => {
    expect(chaveTrilha("NR 18 – Anexo IV – PEMT", "Nº 18, Anexo IV")).not.toBe(
      chaveTrilha("NR-18 – Trabalho a Quente", "Nº 18, item 18.11"),
    );
  });
  it("reciclagem em dia apaga o vencido do curso inicial", () => {
    const rows = buildValidadeRows(
      [
        emissao("1", "01/03/2023", BASICO, "Nº 10", [{ nome: "Ana", cpf: "123.456.789-09" }]),
        emissao("2", "01/02/2025", RECICL, "Nº 10", [{ nome: "Ana", cpf: "12345678909" }]),
      ],
      HOJE,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("ok");
    expect(rows[0].emissoes).toBe(2);
  });
  it("emissão sem CPF é atribuída ao CPF já conhecido do mesmo nome", () => {
    const rows = buildValidadeRows(
      [
        emissao("1", "01/01/2023", "NR 35", "Nº 35", [
          { nome: "José da Silva", cpf: "123.456.789-09" },
        ]),
        emissao("2", "01/09/2026", "NR 35", "Nº 35", [{ nome: "JOSE DA SILVA", cpf: "" }]),
      ],
      HOJE,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("ok");
    expect(rows[0].cpf).toBe("123.456.789-09");
  });
  it("homônimos com CPFs diferentes não são fundidos", () => {
    const rows = buildValidadeRows(
      [
        emissao("1", "01/01/2023", "NR 35", "Nº 35", [
          { nome: "Ana", cpf: "123.456.789-09" },
          { nome: "Ana", cpf: "529.982.247-25" },
        ]),
        emissao("2", "01/09/2026", "NR 35", "Nº 35", [{ nome: "Ana", cpf: "" }]),
      ],
      HOJE,
    );
    expect(rows).toHaveLength(3);
  });
  it("registro corrompido no histórico não derruba o cálculo", () => {
    const rows = buildValidadeRows(
      [
        { id: "x", createdAt: 1 } as HistoryEntry,
        emissao("2", "01/09/2026", "NR 35", "Nº 35", [{ nome: "Ana", cpf: "" }]),
      ],
      HOJE,
    );
    expect(rows).toHaveLength(1);
  });
});

describe("projeção de vencimentos e pessoas", () => {
  const rows = buildValidadeRows(
    [
      emissao("1", "01/01/2024", "NR 35", "Nº 35", [{ nome: "Ana", cpf: "" }], 12), // vencido
      emissao("2", "20/10/2025", "NR 35", "Nº 35", [{ nome: "Bia", cpf: "" }], 12), // vence 20/10/2026 (mês atual)
      emissao(
        "3",
        "05/12/2025",
        "NR 10",
        "Nº 10",
        [
          { nome: "Caio", cpf: "" },
          { nome: "Dani", cpf: "" },
        ],
        12,
      ), // dez/26
      emissao("4", "01/01/2026", "NR 06", "Nº 06", [{ nome: "Ana", cpf: "" }], 0), // sem prazo
    ],
    HOJE,
  );
  it("distribui por mês e separa atrasados", () => {
    const p = projetarVencimentos(rows, HOJE, 6);
    expect(p.atrasados).toBe(1);
    expect(p.meses).toHaveLength(6);
    expect(p.meses[0].rotulo).toBe("out/26");
    expect(p.meses[0].vencem).toBe(1);
    expect(p.meses[0].dentroDaJanela).toBe(1);
    expect(p.meses[2].vencem).toBe(2);
    expect(p.meses[2].principaisNrs[0]).toEqual({ nr: "NR-10", qtd: 2 });
    expect(p.pico?.chave).toBe("2026-12");
  });
  it("conta pessoas distintas e pessoas com vencido", () => {
    const r = resumirValidades(rows);
    expect(r.pessoas).toBe(4);
    expect(r.pessoasComVencido).toBe(1);
    expect(r.porNr.find((g) => g.nr === "NR-06")?.indefinido).toBe(1);
  });
});
