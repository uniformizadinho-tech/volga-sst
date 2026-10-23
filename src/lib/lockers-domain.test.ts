import { describe, expect, it } from "vitest";
import {
  computeStats,
  findInconsistencies,
  lockersFromRows,
  matchesSearch,
  normalizeLocalizacao,
  normalizeLocker,
  normalizeNumero,
  normalizeSetor,
  parseNumeroLocalizacao,
  planImport,
  planStandardization,
  slotKey,
  splitSetorSituacao,
  type Locker,
} from "./lockers-domain";

let seq = 0;
function L(p: Partial<Locker>): Locker {
  seq += 1;
  return {
    id: p.id ?? `id-${seq}`,
    vestiario: "Masculino",
    localizacao: "Vestiário",
    numero: "001",
    ocupante: "",
    setor: "",
    situacao: "",
    updatedAt: 1,
    ...p,
  };
}

describe("normalização", () => {
  it("unifica as grafias reais de local", () => {
    for (const v of ["Vestiario", "vestiario", "Vestiário", "(Vestiario", " VESTIÁRIO "]) {
      expect(normalizeLocalizacao(v)).toBe("Vestiário");
    }
    for (const v of [
      "Corredor Externo",
      "corredor externo",
      "CORREDOR EXTERNO",
      "Corredor externo",
    ]) {
      expect(normalizeLocalizacao(v)).toBe("Corredor Externo");
    }
    expect(normalizeLocalizacao("corredor")).toBe("Corredor");
  });

  it("padroniza número com 3 dígitos", () => {
    expect(normalizeNumero("97")).toBe("097");
    expect(normalizeNumero("402")).toBe("402");
    expect(normalizeNumero("12a")).toBe("12A");
  });

  it("corrige typos de setor e separa situação escrita no setor", () => {
    expect(normalizeSetor("PODUÇÃO")).toBe("PRODUÇÃO");
    expect(normalizeSetor("PRODUÇAO")).toBe("PRODUÇÃO");
    expect(splitSetorSituacao("PRODUÇÃO - COLOCAR ETIQUETA", "")).toEqual({
      setor: "PRODUÇÃO",
      situacao: "COLOCAR ETIQUETA",
    });
    expect(splitSetorSituacao("COM LACRE", "")).toEqual({ setor: "", situacao: "COM LACRE" });
    // setor legítimo não pode virar situação
    expect(splitSetorSituacao("MANUTENÇÃO INDUSTRIAL", "")).toEqual({
      setor: "MANUTENÇÃO INDUSTRIAL",
      situacao: "",
    });
  });

  it("aceita parêntese de fechamento faltando", () => {
    expect(parseNumeroLocalizacao("402 (Vestiario")).toEqual({
      numero: "402",
      localizacao: "Vestiario",
    });
    expect(parseNumeroLocalizacao("271 ( Corredor Externo )")).toEqual({
      numero: "271",
      localizacao: "Corredor Externo",
    });
  });

  it("slotKey ignora acento, caixa e zeros à esquerda", () => {
    expect(slotKey(L({ localizacao: "(Vestiario", numero: "97" }))).toBe(
      slotKey(L({ localizacao: "Vestiário", numero: "097" })),
    );
  });

  it("normalizeLocker é idempotente", () => {
    const l = normalizeLocker(
      L({
        localizacao: "corredor externo",
        numero: "5",
        ocupante: " joão  silva ",
        setor: "produção",
      }),
    );
    expect(normalizeLocker(l)).toEqual(l);
    expect(l.ocupante).toBe("JOÃO SILVA");
  });
});

describe("indicadores e busca", () => {
  it("pendência não distorce ocupados/livres (barra nunca passa de 100%)", () => {
    const s = computeStats([
      L({ numero: "001", ocupante: "A", situacao: "COLOCAR ETIQUETA" }),
      L({ numero: "002", ocupante: "" }),
      L({ numero: "003", ocupante: "B" }),
    ]);
    expect(s.ocupados + s.livres).toBe(s.total);
    expect(s).toMatchObject({ total: 3, ocupados: 2, livres: 1, pendencias: 1, ocupacaoPct: 67 });
  });

  it("busca sem acento, por número sem zero e por múltiplos termos", () => {
    const l = L({ numero: "097", ocupante: "JOSÉ DA SILVA", setor: "PRODUÇÃO" });
    expect(matchesSearch(l, "97")).toBe(true);
    expect(matchesSearch(l, "jose producao")).toBe(true);
    expect(matchesSearch(l, "maria")).toBe(false);
  });
});

describe("inconsistências e padronização", () => {
  const base = [
    L({ id: "a", localizacao: "(Vestiario", numero: "402", ocupante: "BRUNO", setor: "PRODUÇAO" }),
    L({ id: "b", localizacao: "Vestiario", numero: "402" }),
    L({ id: "c", numero: "010", ocupante: "ANA", setor: "ANA" }),
    L({ id: "d", numero: "011", ocupante: "ana" }),
    L({ id: "e", numero: "020", ocupante: "CARLOS", setor: "SESMT" }),
    L({ id: "f", localizacao: "vestiario", numero: "020", ocupante: "PEDRO", setor: "SESMT" }),
  ];

  it("detecta duplicidade de armário, de colaborador e setor = nome", () => {
    const inc = findInconsistencies(base);
    expect(inc.slotsDuplicados).toHaveLength(2);
    expect(inc.ocupantesDuplicados).toHaveLength(1);
    expect(inc.setorIgualNome.map((l) => l.id)).toEqual(["c"]);
    expect(inc.semSetor.map((l) => l.id)).toEqual(["d"]);
  });

  it("remove só cópias vazias e deixa conflitos reais para revisão", () => {
    const plan = planStandardization(base, 99);
    expect(plan.remover.map((l) => l.id)).toEqual(["b"]);
    expect(plan.conflitos).toHaveLength(1);
    expect(plan.conflitos[0].map((l) => l.id).sort()).toEqual(["e", "f"]);
    const a = plan.atualizar.find((u) => u.antes.id === "a");
    expect(a?.depois).toMatchObject({ localizacao: "Vestiário", setor: "PRODUÇÃO", updatedAt: 99 });
    expect(plan.atualizar.some((u) => u.antes.id === "e" || u.antes.id === "f")).toBe(false);
  });
});

describe("planImport", () => {
  it("resolve armário repetido no arquivo (antes derrubava o lote inteiro)", () => {
    const plan = planImport(
      [
        L({ id: "n1", numero: "402", ocupante: "BRUNO" }),
        L({ id: "n2", numero: "402", ocupante: "VAZIO" }),
      ],
      [],
    );
    expect(plan.novos).toHaveLength(1);
    expect(plan.novos[0].ocupante).toBe("BRUNO");
    expect(plan.conflitosArquivo).toHaveLength(1);
  });

  it("reaproveita o id existente mesmo com grafia diferente e lista os campos alterados", () => {
    const existente = L({ id: "old", localizacao: "vestiario", numero: "97", ocupante: "ANA" });
    const plan = planImport(
      [L({ id: "new", localizacao: "Vestiário", numero: "097", ocupante: "BIA" })],
      [existente],
    );
    expect(plan.novos).toHaveLength(0);
    expect(plan.atualizados).toHaveLength(1);
    expect(plan.atualizados[0].depois.id).toBe("old");
    expect(plan.atualizados[0].campos).toEqual(["localizacao", "numero", "ocupante"]);
  });

  it("reimportar a mesma planilha não gera alterações", () => {
    const rows = [
      {
        Vestiário: "Masculino",
        NOME1: "Ana",
        SETOR: "produção",
        "NUMERO DO ARMARIO": "229 (Vestiario)",
        SITUAÇÃO: "",
      },
      {
        Vestiário: "Masculino",
        NOME1: "VAZIO",
        SETOR: "",
        "NUMERO DO ARMARIO": "97 Corredor externo",
        SITUAÇÃO: "",
      },
    ];
    let n = 0;
    const primeira = lockersFromRows(rows, () => `x${n++}`).lockers;
    const segunda = lockersFromRows(rows, () => `y${n++}`).lockers;
    const plan = planImport(segunda, primeira);
    expect(plan.novos).toHaveLength(0);
    expect(plan.atualizados).toHaveLength(0);
    expect(plan.semAlteracao).toBe(2);
  });

  it("avisa colaborador que ficaria em dois armários", () => {
    const plan = planImport(
      [L({ numero: "001", ocupante: "ANA" })],
      [L({ numero: "002", ocupante: "ana" })],
    );
    expect(plan.ocupantesDuplicados).toHaveLength(1);
    expect(plan.ocupantesDuplicados[0].armarios).toHaveLength(2);
  });

  it("grava no registro que já usa a grafia padrão quando a base tem duplicado", () => {
    const plan = planImport(
      [L({ id: "novo", numero: "402", ocupante: "BRUNO" })],
      [
        L({ id: "sujo", localizacao: "(Vestiario", numero: "402", ocupante: "BRUNO" }),
        L({ id: "limpo", numero: "402" }),
      ],
    );
    expect(plan.atualizados[0].depois.id).toBe("limpo");
  });
});

describe("lockersFromRows", () => {
  it("avisa quando a coluna do número não existe", () => {
    const { lockers, warnings } = lockersFromRows([{ Nome: "Ana" }], () => "x");
    expect(lockers).toHaveLength(0);
    expect(warnings[0]).toMatch(/NUMERO DO ARMARIO/);
  });

  it("informa a linha da planilha com problema", () => {
    const { warnings } = lockersFromRows(
      [
        { "NUMERO DO ARMARIO": "229 (Vestiario)", NOME1: "Ana" },
        { "NUMERO DO ARMARIO": "", NOME1: "Bia" },
      ],
      () => "x",
    );
    expect(warnings).toEqual(["Linha 3: sem número de armário — ignorada."]);
  });
});
