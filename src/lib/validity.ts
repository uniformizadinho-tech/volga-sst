import { parseDateBR } from "./date-br";
import { extractNrCode } from "./certificate-template";
import type { HistoryEntry } from "./history-store";
import { csvCell } from "./csv-safe";

export type ValidadeStatus = "vencido" | "atencao" | "ok" | "indefinido";

export interface ValidadeRow {
  key: string;
  historyId: string;
  nome: string;
  cpf: string;
  treinamento: string;
  normaRef: string;
  nrCode: string | null;
  dataEmissao: Date | null;
  validadeMeses: number;
  dataValidade: Date | null;
  diasRestantes: number | null;
  status: ValidadeStatus;
  /** Identidade do treinamento (NR + nome sem "Reciclagem"): curso inicial e reciclagem são a MESMA trilha. */
  trilha: string;
  /** Quantas emissões dessa pessoa nessa trilha existem no histórico (1 = nunca reciclou). */
  emissoes: number;
}

export interface ValidadeOptions {
  /** Janela (dias) em que o certificado passa a "Vence em breve". Padrão: 30. */
  janelaAtencaoDias?: number;
}

export const JANELA_ATENCAO_PADRAO = 30;
const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Soma meses sem "estourar" o mês: 31/01 + 1 mês = 28/02 (ou 29/02), nunca 03/03.
 * O setMonth nativo rolaria para o mês seguinte e adiantaria/atrasaria o vencimento.
 */
export function addMonths(date: Date, months: number): Date {
  const total = date.getFullYear() * 12 + date.getMonth() + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(date.getDate(), lastDay));
}

function diffDias(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((a - b) / DIA_MS);
}

function statusFor(
  diasRestantes: number | null,
  validadeMeses: number,
  janela: number,
): ValidadeStatus {
  if (!validadeMeses || validadeMeses <= 0) return "indefinido";
  if (diasRestantes === null) return "indefinido";
  if (diasRestantes < 0) return "vencido";
  if (diasRestantes <= janela) return "atencao";
  return "ok";
}

function normalizarNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("pt-BR");
}

/**
 * Identidade da pessoa: CPF (só dígitos) quando existir; senão nome sem acento/caixa.
 * Evita que "João  Silva" e "JOAO SILVA" ou "123.456.789-09" e "12345678909" virem duas pessoas.
 */
export function chavePessoa(nome: string, cpf: string): string {
  const digitos = (cpf || "").replace(/\D/g, "");
  return digitos.length === 11 ? `cpf:${digitos}` : `nome:${normalizarNome(nome)}`;
}

/**
 * Trilha do treinamento: a reciclagem SUBSTITUI o curso inicial.
 * "NR10 (Básico) – Segurança…" e "NR10 (Básico) Reciclagem – Segurança…" viram a mesma trilha;
 * sem isso o curso inicial ficaria "vencido" para sempre mesmo com a reciclagem em dia.
 * Treinamentos diferentes da mesma NR (ex.: NR-18 PEMT x NR-18 Trabalho a Quente) continuam separados.
 */
export function chaveTrilha(treinamento: string, normaRef: string): string {
  const nr = extractNrCode(normaRef);
  const nome = normalizarNome(treinamento || "")
    .replace(/\bRECICLAGEM\b/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
  return `${nr ? `NR${nr}` : normalizarNome(normaRef || "")}__${nome}`;
}

export function buildValidadeRows(
  history: HistoryEntry[],
  hoje: Date = new Date(),
  options: ValidadeOptions = {},
): ValidadeRow[] {
  const janela = options.janelaAtencaoDias ?? JANELA_ATENCAO_PADRAO;
  const byKey = new Map<string, { row: ValidadeRow; createdAt: number }>();

  const emissoes = new Map<string, number>();

  // Mesma pessoa emitida às vezes COM e às vezes SEM CPF: se o nome corresponde a um único CPF
  // no histórico, a emissão sem CPF é atribuída a ele (senão viraria uma "segunda pessoa" vencida).
  const cpfsPorNome = new Map<string, Set<string>>();
  for (const entry of history) {
    for (const c of entry?.cols ?? []) {
      const digitos = (c.cpf ?? "").replace(/\D/g, "");
      if (!c.nome?.trim() || digitos.length !== 11) continue;
      const n = normalizarNome(c.nome);
      const set = cpfsPorNome.get(n) ?? new Set<string>();
      set.add(digitos);
      cpfsPorNome.set(n, set);
    }
  }
  const identidade = (nome: string, cpf: string): { pessoa: string; cpf: string } => {
    const chave = chavePessoa(nome, cpf);
    if (chave.startsWith("cpf:")) return { pessoa: chave, cpf };
    const unicos = cpfsPorNome.get(normalizarNome(nome));
    if (unicos && unicos.size === 1) {
      const [d] = unicos;
      return {
        pessoa: `cpf:${d}`,
        cpf: `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`,
      };
    }
    return { pessoa: chave, cpf };
  };

  for (const entry of history) {
    const { shared, cols, createdAt, id } = entry;
    if (!shared || !Array.isArray(cols)) continue; // registro corrompido não derruba o painel
    const dataEmissao = parseDateBR(shared.data) ?? null;
    const validadeMeses = typeof shared.validadeMeses === "number" ? shared.validadeMeses : 0;
    const dataValidade =
      dataEmissao && validadeMeses > 0 ? addMonths(dataEmissao, validadeMeses) : null;
    const diasRestantes = dataValidade ? diffDias(dataValidade, hoje) : null;
    const normaRef = shared.normaRef ?? "";
    const nrCode = extractNrCode(normaRef);
    const trilha = chaveTrilha(shared.treinamento ?? "", normaRef);

    for (const c of cols) {
      const nome = (c.nome ?? "").trim();
      if (!nome || c.incluir === false) continue;
      const { pessoa, cpf } = identidade(nome, (c.cpf ?? "").trim());
      const key = `${pessoa}__${trilha}`;
      emissoes.set(key, (emissoes.get(key) ?? 0) + 1);
      const existing = byKey.get(key);
      if (existing) {
        // Vale a emissão MAIS RECENTE (por data de realização; empate → último registro).
        const atual = existing.row.dataEmissao?.getTime() ?? -Infinity;
        const novo = dataEmissao?.getTime() ?? -Infinity;
        if (novo < atual || (novo === atual && existing.createdAt >= createdAt)) continue;
      }
      byKey.set(key, {
        createdAt,
        row: {
          key,
          historyId: id,
          nome,
          cpf,
          treinamento: shared.treinamento ?? "",
          normaRef,
          nrCode,
          dataEmissao,
          validadeMeses,
          dataValidade,
          diasRestantes,
          status: statusFor(diasRestantes, validadeMeses, janela),
          trilha,
          emissoes: 0,
        },
      });
    }
  }
  for (const [key, v] of byKey) v.row.emissoes = emissoes.get(key) ?? 1;

  return Array.from(byKey.values(), (v) => v.row).sort((a, b) => {
    if (a.diasRestantes === null && b.diasRestantes === null) return a.nome.localeCompare(b.nome);
    if (a.diasRestantes === null) return 1;
    if (b.diasRestantes === null) return -1;
    return a.diasRestantes - b.diasRestantes;
  });
}

export const STATUS_LABEL: Record<ValidadeStatus, string> = {
  vencido: "Vencido",
  atencao: "Vence em breve",
  ok: "Em dia",
  indefinido: "Sem prazo definido",
};

export interface ResumoNr {
  nr: string;
  total: number;
  vencidos: number;
  atencao: number;
  ok: number;
  indefinido: number;
}

export interface ResumoValidades {
  total: number;
  porStatus: Record<ValidadeStatus, number>;
  /**
   * Conformidade = treinamentos válidos ÷ treinamentos com prazo definido.
   * "A vencer" ainda é válido; "sem prazo" fica fora da conta (não dá para afirmar nada).
   */
  conformidadePct: number | null;
  /** Pessoas distintas acompanhadas e quantas têm pelo menos um treinamento vencido. */
  pessoas: number;
  pessoasComVencido: number;
  porNr: ResumoNr[];
}

export function rotuloNr(r: Pick<ValidadeRow, "nrCode">): string {
  return r.nrCode ? `NR-${r.nrCode}` : "Outros";
}

/** Indicadores para o painel do SESMT: conformidade, pessoas afetadas e pontos críticos por NR. */
export function resumirValidades(rows: ValidadeRow[]): ResumoValidades {
  const porStatus: Record<ValidadeStatus, number> = {
    vencido: 0,
    atencao: 0,
    ok: 0,
    indefinido: 0,
  };
  const nrs = new Map<string, ResumoNr>();
  const pessoas = new Set<string>();
  const pessoasVencidas = new Set<string>();
  for (const r of rows) {
    porStatus[r.status]++;
    const pessoa = r.key.split("__")[0];
    pessoas.add(pessoa);
    if (r.status === "vencido") pessoasVencidas.add(pessoa);
    const nr = rotuloNr(r);
    const g = nrs.get(nr) ?? { nr, total: 0, vencidos: 0, atencao: 0, ok: 0, indefinido: 0 };
    g.total++;
    if (r.status === "vencido") g.vencidos++;
    else if (r.status === "atencao") g.atencao++;
    else if (r.status === "ok") g.ok++;
    else g.indefinido++;
    nrs.set(nr, g);
  }
  const comPrazo = rows.length - porStatus.indefinido;
  return {
    total: rows.length,
    porStatus,
    conformidadePct: comPrazo
      ? Math.round(((comPrazo - porStatus.vencido) / comPrazo) * 1000) / 10
      : null,
    pessoas: pessoas.size,
    pessoasComVencido: pessoasVencidas.size,
    porNr: Array.from(nrs.values()).sort(
      (a, b) =>
        b.vencidos - a.vencidos ||
        b.atencao - a.atencao ||
        b.total - a.total ||
        a.nr.localeCompare(b.nr, "pt-BR", { numeric: true }),
    ),
  };
}

export interface MesVencimento {
  /** AAAA-MM */
  chave: string;
  /** "out/26" */
  rotulo: string;
  /** Treinamentos que vencem no mês (ainda não vencidos). */
  vencem: number;
  /** Quantos desses já estão dentro da janela de alerta. */
  dentroDaJanela: number;
  /** NRs que mais vencem no mês (para o tooltip / planejamento de turma). */
  principaisNrs: { nr: string; qtd: number }[];
}

export interface ProjecaoVencimentos {
  /** Já vencidos hoje (fila de regularização imediata). */
  atrasados: number;
  meses: MesVencimento[];
  /** Mês com mais vencimentos no horizonte (onde a turma de reciclagem rende mais). */
  pico: MesVencimento | null;
}

const MESES_CURTOS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

/**
 * Calendário de reciclagem: quantos treinamentos vencem em cada um dos próximos `meses` meses
 * (incluindo o atual). Serve para dimensionar e agendar turmas antes do vencimento.
 */
export function projetarVencimentos(
  rows: ValidadeRow[],
  hoje: Date = new Date(),
  meses = 12,
): ProjecaoVencimentos {
  const baldes: (MesVencimento & { _nrs: Map<string, number> })[] = [];
  for (let i = 0; i < meses; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
    baldes.push({
      chave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      rotulo: `${MESES_CURTOS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
      vencem: 0,
      dentroDaJanela: 0,
      principaisNrs: [],
      _nrs: new Map(),
    });
  }
  const inicio = hoje.getFullYear() * 12 + hoje.getMonth();
  let atrasados = 0;
  for (const r of rows) {
    if (r.status === "vencido") {
      atrasados++;
      continue;
    }
    if (r.status === "indefinido" || !r.dataValidade) continue;
    const idx = r.dataValidade.getFullYear() * 12 + r.dataValidade.getMonth() - inicio;
    if (idx < 0 || idx >= meses) continue;
    const b = baldes[idx];
    b.vencem++;
    if (r.status === "atencao") b.dentroDaJanela++;
    const nr = rotuloNr(r);
    b._nrs.set(nr, (b._nrs.get(nr) ?? 0) + 1);
  }
  const out: MesVencimento[] = baldes.map(({ _nrs, ...b }) => ({
    ...b,
    principaisNrs: Array.from(_nrs, ([nr, qtd]) => ({ nr, qtd }))
      .sort((a, z) => z.qtd - a.qtd)
      .slice(0, 3),
  }));
  const pico = out.reduce<MesVencimento | null>(
    (m, b) => (b.vencem > 0 && (!m || b.vencem > m.vencem) ? b : m),
    null,
  );
  return { atrasados, meses: out, pico };
}

function fmt(d: Date | null): string {
  return d ? d.toLocaleDateString("pt-BR") : "";
}

/** Lista de reciclagem (vencidos + a vencer) pronta para enviar a gestores/RH. Separador ; e BOM p/ Excel BR. */
export function validadesParaCsv(rows: ValidadeRow[]): string {
  const head = [
    "Nome",
    "CPF",
    "Treinamento",
    "Norma",
    "Realizado em",
    "Vence em",
    "Dias restantes",
    "Situação",
  ];
  const linhas = rows
    .filter((r) => r.status === "vencido" || r.status === "atencao")
    .map((r) =>
      [
        r.nome,
        r.cpf,
        r.treinamento,
        r.normaRef,
        fmt(r.dataEmissao),
        fmt(r.dataValidade),
        r.diasRestantes === null ? "" : String(r.diasRestantes),
        STATUS_LABEL[r.status],
      ]
        .map(csvCell)
        .join(";"),
    );
  return "\ufeff" + [head.map(csvCell).join(";"), ...linhas].join("\r\n");
}
