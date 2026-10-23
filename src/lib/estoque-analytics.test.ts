import { describe, expect, it } from "vitest";
import {
  analisarContagem,
  divergenciaPorTipo,
  impactoPorTipo,
  ritmoContagem,
  topDivergencias,
} from "./estoque-analytics";
import type { EstoqueItem, EstoqueLancamento } from "./estoque-store";

const it_ = (cod: string, sis: number, preco: number | null, tipo = "Luva"): EstoqueItem => ({
  codBarras: cod,
  sku: cod,
  tipo,
  item: cod,
  cor: "",
  tamanho: "",
  estoqueSistema: sis,
  preco,
  updatedAt: 0,
});
const l = (
  cod: string,
  q: number,
  motivo: EstoqueLancamento["motivo"] = "leitura",
): EstoqueLancamento => ({
  id: cod + q + Math.random(),
  codBarras: cod,
  quantidade: q,
  createdAt: 0,
  motivo,
});

describe("analisarContagem", () => {
  const itens = [
    it_("A", 10, 5),
    it_("B", 4, 20, "Bota"),
    it_("C", 3, null),
    it_("D", 7, 2),
    it_("E", 2, 1),
  ];
  const lanc = [l("A", 10), l("B", 1), l("B", 1), l("C", 5), l("D", 0, "conferencia")];
  const { linhas, resumo } = analisarContagem(itens, lanc);
  const por = Object.fromEntries(linhas.map((x) => [x.item.codBarras, x]));

  it("pendente não é falta; zero conferido é falta", () => {
    expect(por.E.situacao).toBe("pendente");
    expect(por.E.contado).toBeNull();
    expect(por.D.situacao).toBe("falta");
    expect(por.D.contado).toBe(0);
  });
  it("soma lançamentos e calcula valor", () => {
    expect(por.B.contado).toBe(2);
    expect(por.B.valorDiferenca).toBe(-40);
    expect(por.C.situacao).toBe("sobra");
    expect(por.C.valorDiferenca).toBeNull();
  });
  it("resumo coerente", () => {
    expect(resumo.conferidos).toBe(4);
    expect(resumo.pendentes).toBe(1);
    expect(resumo.coberturaPct).toBe(80);
    expect(resumo.acuraciaPct).toBe(25);
    expect(resumo.valorFalta).toBe(54);
    expect(resumo.valorLiquido).toBe(-54);
    expect(resumo.unidadesFalta).toBe(9);
  });
  it("top divergências por impacto e agrupamento por tipo", () => {
    expect(topDivergencias(linhas, 1)[0].item.codBarras).toBe("B");
    expect(divergenciaPorTipo(linhas)[0].tipo).toBe("Bota");
  });
  it("catálogo vazio não quebra", () => {
    expect(analisarContagem([], []).resumo.acuraciaPct).toBeNull();
  });
});

describe("ritmo da contagem", () => {
  const H = 3_600_000;
  const t0 = new Date(2026, 9, 3, 8, 0).getTime();
  const itens = ["A", "B", "C", "D"].map((c) => it_(c, 1, 1));
  const at = (cod: string, ms: number): EstoqueLancamento => ({
    id: cod + ms,
    codBarras: cod,
    quantidade: 1,
    createdAt: ms,
    motivo: "leitura",
  });
  it("sem leituras => vazio", () => {
    expect(ritmoContagem(itens, []).pontos).toHaveLength(0);
  });
  it("calcula itens/hora ignorando pausas longas e estima o restante", () => {
    // 2 itens em 30 min, pausa de 2h (ignorada), mais 0 itens novos (releitura de A)
    const r = ritmoContagem(itens, [at("A", t0), at("B", t0 + 0.5 * H), at("A", t0 + 2.5 * H)]);
    expect(r.itensPorHora).toBe(4);
    expect(r.horasRestantes).toBe(0.5);
    expect(r.pontos[r.pontos.length - 1].coberturaPct).toBe(50);
  });
  it("cobertura acumulada nunca diminui", () => {
    const r = ritmoContagem(
      itens,
      [at("A", t0), at("B", t0 + 600_000), at("C", t0 + 1_200_000), at("D", t0 + 1_800_000)],
      4,
    );
    const c = r.pontos.map((p) => p.coberturaPct);
    expect(c.every((v, i) => i === 0 || v >= c[i - 1])).toBe(true);
    expect(c[c.length - 1]).toBe(100);
    expect(r.horasRestantes).toBe(0);
  });
});

describe("impacto por tipo", () => {
  it("separa falta e sobra em R$", () => {
    const { linhas } = analisarContagem([it_("A", 10, 5), it_("B", 1, 3)], [l("A", 8), l("B", 3)]);
    const g = impactoPorTipo(linhas)[0];
    expect(g).toEqual({ tipo: "Luva", falta: 10, sobra: 6, unidadesFalta: 2, unidadesSobra: 2 });
  });
});
