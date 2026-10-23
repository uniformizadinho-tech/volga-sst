import { describe, expect, it } from "vitest";
import { DEFAULT_SHARED } from "./certificate-template";
import type { HistoryEntry } from "./history-store";
import { contarFrentesComAcao, montarPendenciaInspecoes, montarPendencias } from "./pendencias";
import { buildValidadeRows } from "./validity";
import type { Locker } from "./lockers-domain";
import type { EstoqueItem, EstoqueLancamento } from "./estoque-store";

const HOJE = new Date(2026, 9, 3);
const hist: HistoryEntry[] = [
  {
    id: "a",
    createdAt: 1,
    shared: {
      ...DEFAULT_SHARED,
      data: "01/01/2025",
      validadeMeses: 12,
      normaRef: "Nº 35",
      treinamento: "NR 35",
    },
    cols: [{ nome: "Ana", cpf: "" }],
  },
  {
    id: "b",
    createdAt: 2,
    shared: {
      ...DEFAULT_SHARED,
      data: "15/10/2025",
      validadeMeses: 12,
      normaRef: "Nº 35",
      treinamento: "NR 35",
    },
    cols: [
      { nome: "Bia", cpf: "" },
      { nome: "Cris", cpf: "" },
    ],
  },
];
const base = {
  validades: buildValidadeRows(hist, HOJE),
  janelaDias: 30,
  armarios: [] as Locker[],
  estoqueItens: [] as EstoqueItem[],
  lancamentos: [] as EstoqueLancamento[],
};
const item = (c: string, s: number): EstoqueItem => ({
  codBarras: c,
  sku: c,
  tipo: "Luva",
  item: c,
  cor: "",
  tamanho: "",
  estoqueSistema: s,
  preco: 10,
  updatedAt: 0,
});
const lanc = (c: string, q: number): EstoqueLancamento => ({
  id: c + q,
  codBarras: c,
  quantidade: q,
  createdAt: 0,
  motivo: "leitura",
});
const locker = (n: string, oc: string): Locker => ({
  id: n + oc,
  vestiario: "Masculino",
  localizacao: "Vestiário",
  numero: n,
  ocupante: oc,
  setor: "Obra",
  situacao: "",
  updatedAt: 0,
});

describe("montarPendencias", () => {
  it("tudo em ordem => lista vazia", () => {
    expect(montarPendencias({ ...base, validades: [] })).toHaveLength(0);
  });
  it("vencidos vêm antes de a vencer e levam o filtro", () => {
    const p = montarPendencias(base);
    expect(p[0].id).toBe("cert-vencidos");
    expect(p[0].search).toEqual({ status: "vencido" });
    expect(p[1].id).toBe("cert-a-vencer");
    expect(p[1].titulo.includes("2 treinamentos vencem")).toBe(true);
  });
  it("estoque: não iniciado, depois pendentes e divergências", () => {
    const itens = [item("A", 5), item("B", 5)];
    expect(montarPendencias({ ...base, validades: [], estoqueItens: itens })[0].id).toBe(
      "estoque-nao-iniciado",
    );
    const ids = montarPendencias({
      ...base,
      validades: [],
      estoqueItens: itens,
      lancamentos: [lanc("A", 3)],
    }).map((x) => x.id);
    expect(ids).toEqual(["estoque-pendentes", "estoque-divergencias"]);
  });
  it("armários: ocupante duplicado gera inconsistência", () => {
    const p = montarPendencias({
      ...base,
      validades: [],
      armarios: [locker("1", "Ana Souza"), locker("2", "Ana Souza")],
    });
    expect(p.some((x) => x.id === "armarios-inconsistencias")).toBe(true);
  });

  it("inclui pendência de inspeção não crítica no bloco acionável", () => {
    const p = montarPendenciaInspecoes({
      pendentes: 2,
      totalPendencias: 1,
      criticas: 0,
      atrasadas: 1,
      vencidos: 0,
    });
    expect(p).toMatchObject({ area: "inspecoes", to: "/inspecoes", severidade: "atencao" });
    expect(p?.detalhe).toContain("pendência aberta");
    expect(p?.detalhe).toContain("equipamentos sem inspeção no mês");
  });

  it("conta frentes únicas, sem duplicar dois alertas do mesmo módulo", () => {
    const estoque = montarPendencias({
      ...base,
      validades: [],
      estoqueItens: [item("A", 5), item("B", 5)],
      lancamentos: [lanc("A", 3)],
    });
    const inspecoes = montarPendenciaInspecoes({
      pendentes: 1,
      totalPendencias: 0,
      criticas: 0,
      atrasadas: 0,
      vencidos: 0,
    });
    expect(estoque.filter((p) => p.area === "estoque")).toHaveLength(2);
    expect(contarFrentesComAcao([...estoque, ...(inspecoes ? [inspecoes] : [])], 3)).toBe(3);
  });
});
