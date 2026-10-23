import { describe, expect, it } from "vitest";
import { montarPainelGeral, ocupacaoPorVestiario } from "./painel-geral";
import type { Locker } from "./lockers-domain";
import type { HistoryEntry } from "./history-store";

const HOJE = new Date(2026, 9, 3);
const locker = (n: string, vest: string, oc: string, situacao = ""): Locker => ({
  id: n + vest,
  vestiario: vest,
  localizacao: "Vestiário",
  numero: n,
  ocupante: oc,
  setor: oc ? "Obra" : "",
  situacao,
  updatedAt: 0,
});
const hist = [
  {
    id: "a",
    createdAt: 1,
    shared: { data: "01/01/2025", validadeMeses: 12, normaRef: "Nº 35", treinamento: "NR 35" },
    cols: [{ nome: "Ana", cpf: "" }],
  },
  {
    id: "b",
    createdAt: 2,
    shared: { data: "15/10/2025", validadeMeses: 12, normaRef: "Nº 35", treinamento: "NR 35" },
    cols: [{ nome: "Bia", cpf: "" }],
  },
] as unknown as HistoryEntry[];

describe("painel geral", () => {
  it("ocupação por vestiário", () => {
    const v = ocupacaoPorVestiario([
      locker("1", "Masculino", "Ana"),
      locker("2", "Masculino", ""),
      locker("3", "Feminino", "", "EM MANUTENÇÃO"),
    ]);
    expect(v[0]).toEqual({
      vestiario: "Masculino",
      ocupados: 1,
      livres: 1,
      comPendencia: 0,
      total: 2,
    });
    expect(v[1].comPendencia).toBe(1);
  });
  it("não conta duplicata física vazia como vaga livre", () => {
    const ocupado = locker("001", "Masculino", "Ana");
    const copiaVazia = { ...locker("001", "Masculino", ""), id: "copia-vazia" };
    const p = montarPainelGeral({
      historico: [],
      janelaDias: 30,
      armarios: [ocupado, copiaVazia],
      estoqueItens: [],
      lancamentos: [],
      hoje: HOJE,
    });
    expect(p.armarios.stats).toMatchObject({ total: 1, ocupados: 1, livres: 0, ocupacaoPct: 100 });
    expect(p.armarios.porVestiario[0]).toMatchObject({ total: 1, ocupados: 1, livres: 0 });
    expect(p.armarios.inconsistencias).toBeGreaterThan(0);
  });
  it("monta tudo a partir da mesma base", () => {
    const p = montarPainelGeral({
      historico: hist,
      janelaDias: 30,
      armarios: [],
      estoqueItens: [],
      lancamentos: [],
      hoje: HOJE,
    });
    expect(p.validades.resumo.porStatus.vencido).toBe(1);
    expect(p.validades.proximos).toHaveLength(1);
    expect(p.validades.projecao.atrasados).toBe(1);
    expect(p.pendencias[0].id).toBe("cert-vencidos");
    expect(p.estoque.iniciada).toBe(false);
    expect(p.armarios.stats.total).toBe(0);
  });
  it("base vazia não quebra", () => {
    const p = montarPainelGeral({
      historico: [],
      janelaDias: 30,
      armarios: [],
      estoqueItens: [],
      lancamentos: [],
      hoje: HOJE,
    });
    expect(p.validades.resumo.conformidadePct).toBeNull();
    expect(p.pendencias).toHaveLength(0);
  });
});
