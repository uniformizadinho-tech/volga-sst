import type { EstoqueItem, EstoqueLancamento } from "./estoque-store";

export type SituacaoContagem = "pendente" | "ok" | "falta" | "sobra";

export interface LinhaContagem {
  item: EstoqueItem;
  /** null = ainda não conferido (nenhum lançamento). 0 só quando conferido como zero. */
  contado: number | null;
  diferenca: number | null; // contado - sistema
  valorDiferenca: number | null; // diferenca * preço (R$); null sem preço/pendente
  situacao: SituacaoContagem;
}

export interface ResumoContagem {
  totalItens: number;
  conferidos: number;
  pendentes: number;
  coberturaPct: number; // conferidos / total
  acuraciaPct: number | null; // conferidos sem divergência / conferidos
  itensComFalta: number;
  itensComSobra: number;
  unidadesFalta: number;
  unidadesSobra: number;
  valorFalta: number; // R$ (positivo)
  valorSobra: number; // R$ (positivo)
  valorLiquido: number; // sobra - falta
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function analisarContagem(
  itens: EstoqueItem[],
  lancamentos: EstoqueLancamento[],
): {
  linhas: LinhaContagem[];
  resumo: ResumoContagem;
} {
  const soma = new Map<string, number>();
  for (const l of lancamentos) soma.set(l.codBarras, (soma.get(l.codBarras) ?? 0) + l.quantidade);

  const linhas: LinhaContagem[] = itens.map((item) => {
    if (!soma.has(item.codBarras)) {
      return { item, contado: null, diferenca: null, valorDiferenca: null, situacao: "pendente" };
    }
    const contado = Math.max(0, soma.get(item.codBarras)!);
    const diferenca = contado - item.estoqueSistema;
    const valorDiferenca = item.preco === null ? null : r2(diferenca * item.preco);
    const situacao: SituacaoContagem = diferenca === 0 ? "ok" : diferenca < 0 ? "falta" : "sobra";
    return { item, contado, diferenca, valorDiferenca, situacao };
  });

  const conf = linhas.filter((l) => l.situacao !== "pendente");
  const faltas = conf.filter((l) => l.situacao === "falta");
  const sobras = conf.filter((l) => l.situacao === "sobra");
  const valor = (ls: LinhaContagem[]) =>
    Math.abs(ls.reduce((s, l) => s + (l.valorDiferenca ?? 0), 0));
  const valorFalta = r2(valor(faltas));
  const valorSobra = r2(valor(sobras));

  return {
    linhas,
    resumo: {
      totalItens: itens.length,
      conferidos: conf.length,
      pendentes: itens.length - conf.length,
      coberturaPct: itens.length ? r2((conf.length / itens.length) * 100) : 0,
      acuraciaPct: conf.length
        ? r2((conf.filter((l) => l.situacao === "ok").length / conf.length) * 100)
        : null,
      itensComFalta: faltas.length,
      itensComSobra: sobras.length,
      unidadesFalta: faltas.reduce((s, l) => s + Math.abs(l.diferenca!), 0),
      unidadesSobra: sobras.reduce((s, l) => s + l.diferenca!, 0),
      valorFalta,
      valorSobra,
      valorLiquido: r2(valorSobra - valorFalta),
    },
  };
}

/** Divergências ordenadas pelo impacto financeiro (maior primeiro) — o que o gestor precisa recontar antes. */
export function topDivergencias(linhas: LinhaContagem[], limite = 10): LinhaContagem[] {
  return linhas
    .filter((l) => l.situacao === "falta" || l.situacao === "sobra")
    .sort(
      (a, b) =>
        Math.abs(b.valorDiferenca ?? 0) - Math.abs(a.valorDiferenca ?? 0) ||
        Math.abs(b.diferenca ?? 0) - Math.abs(a.diferenca ?? 0),
    )
    .slice(0, limite);
}

/** Agrupa por tipo (ex.: Luva, Bota, Capacete) para localizar onde o inventário diverge mais. */
export function divergenciaPorTipo(
  linhas: LinhaContagem[],
): { tipo: string; conferidos: number; divergentes: number; valorLiquido: number }[] {
  const m = new Map<
    string,
    { tipo: string; conferidos: number; divergentes: number; valorLiquido: number }
  >();
  for (const l of linhas) {
    if (l.situacao === "pendente") continue;
    const tipo = l.item.tipo?.trim() || "Sem tipo";
    const g = m.get(tipo) ?? { tipo, conferidos: 0, divergentes: 0, valorLiquido: 0 };
    g.conferidos++;
    if (l.situacao !== "ok") g.divergentes++;
    g.valorLiquido = r2(g.valorLiquido + (l.valorDiferenca ?? 0));
    m.set(tipo, g);
  }
  return Array.from(m.values()).sort((a, b) => Math.abs(b.valorLiquido) - Math.abs(a.valorLiquido));
}

export interface PontoRitmo {
  /** Início do intervalo (ms). */
  inicio: number;
  rotulo: string;
  /** Itens que receberam a PRIMEIRA leitura no intervalo. */
  novosConferidos: number;
  /** Cobertura acumulada (%) ao fim do intervalo. */
  coberturaPct: number;
}

export interface RitmoContagem {
  pontos: PontoRitmo[];
  /** Itens/hora considerando só o tempo efetivamente contando (pausas > 30 min não entram). */
  itensPorHora: number | null;
  /** Estimativa de horas de trabalho para conferir os pendentes no ritmo atual. */
  horasRestantes: number | null;
  inicio: number | null;
  ultimaLeitura: number | null;
}

const PAUSA_MS = 30 * 60 * 1000;

/**
 * Ritmo da contagem: evolução da cobertura no tempo e previsão de término.
 * Responde "a gente termina hoje?" — algo que os totais sozinhos não respondem.
 */
export function ritmoContagem(
  itens: EstoqueItem[],
  lancamentos: EstoqueLancamento[],
  intervalos = 12,
): RitmoContagem {
  const vazio: RitmoContagem = {
    pontos: [],
    itensPorHora: null,
    horasRestantes: null,
    inicio: null,
    ultimaLeitura: null,
  };
  if (!itens.length || !lancamentos.length) return vazio;
  const catalogo = new Set(itens.map((i) => i.codBarras));
  const primeira = new Map<string, number>();
  const tempos: number[] = [];
  for (const l of lancamentos) {
    if (!catalogo.has(l.codBarras) || !Number.isFinite(l.createdAt) || l.createdAt <= 0) continue;
    tempos.push(l.createdAt);
    const p = primeira.get(l.codBarras);
    if (p === undefined || l.createdAt < p) primeira.set(l.codBarras, l.createdAt);
  }
  if (!primeira.size) return vazio;
  tempos.sort((x, y) => x - y);
  const inicio = tempos[0];
  const fim = tempos[tempos.length - 1];

  // Tempo ativo: soma dos intervalos entre leituras consecutivas, ignorando pausas longas.
  let ativoMs = 0;
  for (let i = 1; i < tempos.length; i++) {
    const d = tempos[i] - tempos[i - 1];
    if (d <= PAUSA_MS) ativoMs += d;
  }
  const horas = ativoMs / 3_600_000;
  const itensPorHora = horas >= 0.05 ? Math.round((primeira.size / horas) * 10) / 10 : null;
  const pendentes = itens.length - primeira.size;
  const horasRestantes =
    itensPorHora && pendentes > 0
      ? Math.round((pendentes / itensPorHora) * 10) / 10
      : pendentes === 0
        ? 0
        : null;

  const n = Math.max(1, intervalos);
  const passo = Math.max(1, Math.ceil((fim - inicio + 1) / n));
  const primeiras = Array.from(primeira.values()).sort((x, y) => x - y);
  const mesmoDia = new Date(inicio).toDateString() === new Date(fim).toDateString();
  const fmt = (ms: number) =>
    mesmoDia
      ? new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
      : new Date(ms).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
  const pontos: PontoRitmo[] = [];
  let k = 0;
  for (let i = 0; i < n; i++) {
    const ini = inicio + i * passo;
    const lim = ini + passo;
    let novos = 0;
    while (k < primeiras.length && primeiras[k] < lim) {
      novos++;
      k++;
    }
    pontos.push({
      inicio: ini,
      rotulo: fmt(ini),
      novosConferidos: novos,
      coberturaPct: r2((k / itens.length) * 100),
    });
    if (lim > fim) break;
  }
  return { pontos, itensPorHora, horasRestantes, inicio, ultimaLeitura: fim };
}

/** Faltas x sobras em R$ e unidades por tipo — base do gráfico "onde o inventário diverge". */
export function impactoPorTipo(
  linhas: LinhaContagem[],
  limite = 6,
): { tipo: string; falta: number; sobra: number; unidadesFalta: number; unidadesSobra: number }[] {
  const m = new Map<
    string,
    { tipo: string; falta: number; sobra: number; unidadesFalta: number; unidadesSobra: number }
  >();
  for (const l of linhas) {
    if (l.situacao !== "falta" && l.situacao !== "sobra") continue;
    const tipo = l.item.tipo?.trim() || "Sem tipo";
    const g = m.get(tipo) ?? { tipo, falta: 0, sobra: 0, unidadesFalta: 0, unidadesSobra: 0 };
    const v = Math.abs(l.valorDiferenca ?? 0);
    const u = Math.abs(l.diferenca ?? 0);
    if (l.situacao === "falta") {
      g.falta = r2(g.falta + v);
      g.unidadesFalta += u;
    } else {
      g.sobra = r2(g.sobra + v);
      g.unidadesSobra += u;
    }
    m.set(tipo, g);
  }
  return Array.from(m.values())
    .sort(
      (a, b) =>
        b.falta + b.sobra - (a.falta + a.sobra) ||
        b.unidadesFalta + b.unidadesSobra - (a.unidadesFalta + a.unidadesSobra),
    )
    .slice(0, limite);
}
