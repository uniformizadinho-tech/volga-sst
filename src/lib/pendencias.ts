import type { Locker } from "./lockers-domain";
import { findInconsistencies, hasPendencia } from "./lockers-domain";
import type { EstoqueItem, EstoqueLancamento } from "./estoque-store";
import { analisarContagem } from "./estoque-analytics";
import type { ValidadeRow } from "./validity";

export type Severidade = "critica" | "atencao" | "info";
export type AreaPendencia = "certificados" | "estoque" | "armarios" | "inspecoes";

export interface Pendencia {
  id: string;
  area: AreaPendencia;
  severidade: Severidade;
  titulo: string;
  detalhe: string;
  /** Rota de destino e, quando houver, o filtro já aplicado. */
  to: "/validades" | "/estoque" | "/armarios" | "/certificados" | "/inspecoes";
  search?: { status?: string };
  acao: string;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const ORDEM: Record<Severidade, number> = { critica: 0, atencao: 1, info: 2 };

/** "NR-35 (4), NR-10 (2)" — as normas com mais ocorrências, para o gestor saber qual turma abrir. */
function topNrs(rows: ValidadeRow[], limite = 2): string {
  const m = new Map<string, number>();
  for (const r of rows) {
    const nr = r.nrCode ? `NR-${r.nrCode}` : "Outros";
    m.set(nr, (m.get(nr) ?? 0) + 1);
  }
  return Array.from(m)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR", { numeric: true }))
    .slice(0, limite)
    .map(([nr, n]) => `${nr} (${n})`)
    .join(", ");
}

export interface EntradaPendencias {
  validades: ValidadeRow[];
  janelaDias: number;
  armarios: Locker[];
  estoqueItens: EstoqueItem[];
  lancamentos: EstoqueLancamento[];
}

/** Fila de ação do dia, já ordenada por gravidade. Lista vazia = tudo em ordem. */
export function montarPendencias(e: EntradaPendencias): Pendencia[] {
  const out: Pendencia[] = [];

  const vencidosRows = e.validades.filter((r) => r.status === "vencido");
  const aVencerRows = e.validades.filter((r) => r.status === "atencao");
  const vencidos = vencidosRows.length;
  const aVencer = aVencerRows.length;
  const pessoasVencidas = new Set(vencidosRows.map((r) => r.key.split("__")[0])).size;
  const nrsCriticas = topNrs(vencidosRows);
  const urgentes = aVencerRows.filter((r) => (r.diasRestantes ?? Infinity) <= 7).length;
  if (vencidos > 0) {
    out.push({
      id: "cert-vencidos",
      area: "certificados",
      severidade: "critica",
      titulo: `${plural(vencidos, "treinamento vencido", "treinamentos vencidos")}`,
      detalhe: `${plural(pessoasVencidas, "colaborador", "colaboradores")} sem habilitação válida${nrsCriticas ? ` · mais crítico: ${nrsCriticas}` : ""}. Risco de autuação.`,
      to: "/validades",
      search: { status: "vencido" },
      acao: "Ver vencidos",
    });
  }
  if (aVencer > 0) {
    out.push({
      id: "cert-a-vencer",
      area: "certificados",
      severidade: "atencao",
      titulo: `${plural(aVencer, "treinamento vence", "treinamentos vencem")} em até ${e.janelaDias} dias`,
      detalhe:
        urgentes > 0
          ? `${plural(urgentes, "vence", "vencem")} nos próximos 7 dias — agende a turma agora.`
          : `Hora de agendar a turma de reciclagem${topNrs(aVencerRows) ? ` (${topNrs(aVencerRows)})` : ""}.`,
      to: "/validades",
      search: { status: "atencao" },
      acao: "Planejar reciclagem",
    });
  }

  if (e.estoqueItens.length > 0) {
    const { resumo } = analisarContagem(e.estoqueItens, e.lancamentos);
    if (e.lancamentos.length === 0) {
      out.push({
        id: "estoque-nao-iniciado",
        area: "estoque",
        severidade: "info",
        titulo: "Contagem de estoque não iniciada",
        detalhe: `${plural(resumo.totalItens, "item cadastrado", "itens cadastrados")} aguardando conferência.`,
        to: "/estoque",
        acao: "Iniciar contagem",
      });
    } else {
      if (resumo.pendentes > 0) {
        out.push({
          id: "estoque-pendentes",
          area: "estoque",
          severidade: "atencao",
          titulo: `${plural(resumo.pendentes, "item ainda não conferido", "itens ainda não conferidos")}`,
          detalhe: `Cobertura da contagem: ${resumo.coberturaPct.toLocaleString("pt-BR")}%.`,
          to: "/estoque",
          acao: "Continuar contagem",
        });
      }
      const div = resumo.itensComFalta + resumo.itensComSobra;
      if (div > 0) {
        const valor = resumo.valorFalta + resumo.valorSobra;
        out.push({
          id: "estoque-divergencias",
          area: "estoque",
          severidade: "atencao",
          titulo: `${plural(div, "divergência", "divergências")} de estoque`,
          detalhe:
            valor > 0
              ? `Impacto de ${valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} entre faltas e sobras.`
              : "Confira os itens com diferença antes de fechar o inventário.",
          to: "/estoque",
          acao: "Revisar divergências",
        });
      }
    }
  }

  if (e.armarios.length > 0) {
    const inc = findInconsistencies(e.armarios);
    if (inc.total > 0) {
      out.push({
        id: "armarios-inconsistencias",
        area: "armarios",
        severidade: "atencao",
        titulo: `${plural(inc.total, "inconsistência", "inconsistências")} no cadastro de armários`,
        detalhe: "Duplicidades, ocupante em mais de um armário ou dados fora do padrão.",
        to: "/armarios",
        acao: "Corrigir cadastro",
      });
    }
    const comSituacao = e.armarios.filter(hasPendencia).length;
    if (comSituacao > 0) {
      out.push({
        id: "armarios-situacao",
        area: "armarios",
        severidade: "info",
        titulo: `${plural(comSituacao, "armário com situação pendente", "armários com situação pendente")}`,
        detalhe: "Etiqueta, lacre, manutenção ou bloqueio a resolver.",
        to: "/armarios",
        acao: "Ver armários",
      });
    }
  }

  return ordenarPendencias(out);
}

export function ordenarPendencias(pendencias: Pendencia[]): Pendencia[] {
  return [...pendencias].sort((a, b) => ORDEM[a.severidade] - ORDEM[b.severidade]);
}

export interface ResumoPendenciaInspecoes {
  pendentes: number;
  totalPendencias: number;
  criticas: number;
  atrasadas: number;
  vencidos: number;
}

/** Converte os indicadores de inspeção em um único item acionável e navegável. */
export function montarPendenciaInspecoes(resumo: ResumoPendenciaInspecoes): Pendencia | null {
  if (!resumo.pendentes && !resumo.totalPendencias && !resumo.vencidos) return null;
  const severidade: Severidade =
    resumo.criticas > 0 || resumo.vencidos > 0
      ? "critica"
      : resumo.totalPendencias > 0
        ? "atencao"
        : "info";
  const detalhes = [
    resumo.totalPendencias
      ? plural(resumo.totalPendencias, "pendência aberta", "pendências abertas")
      : null,
    resumo.criticas ? plural(resumo.criticas, "crítica", "críticas") : null,
    resumo.vencidos
      ? plural(resumo.vencidos, "equipamento vencido", "equipamentos vencidos")
      : null,
    resumo.atrasadas
      ? plural(resumo.atrasadas, "prazo de ação atrasado", "prazos de ação atrasados")
      : null,
    resumo.pendentes
      ? plural(
          resumo.pendentes,
          "equipamento sem inspeção no mês",
          "equipamentos sem inspeção no mês",
        )
      : null,
  ].filter(Boolean);
  const titulo = resumo.totalPendencias
    ? `${plural(resumo.totalPendencias, "Pendência aberta", "Pendências abertas")} em inspeções`
    : resumo.vencidos
      ? `${plural(resumo.vencidos, "Equipamento vencido", "Equipamentos vencidos")}`
      : `${plural(resumo.pendentes, "Equipamento sem inspeção", "Equipamentos sem inspeção")} neste mês`;

  return {
    id: "inspecoes-abertas",
    area: "inspecoes",
    severidade,
    titulo,
    detalhe: detalhes.join(" · "),
    to: "/inspecoes",
    acao: "Revisar inspeções",
  };
}

/** Conta fontes operacionais únicas; vários alertas no estoque continuam sendo uma frente. */
export function contarFrentesComAcao(pendencias: Pendencia[], matrizEmAberto = 0): number {
  const areas = new Set<string>(pendencias.map((pendencia) => pendencia.area));
  if (matrizEmAberto > 0) areas.add("matriz");
  return areas.size;
}
