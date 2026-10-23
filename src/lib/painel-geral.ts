import type { HistoryEntry } from "./history-store";
import type { Locker } from "./lockers-domain";
import {
  computeStats,
  findInconsistencies,
  groupByPhysicalSlot,
  hasPendencia,
  isOcupado,
  type LockerStats,
} from "./lockers-domain";
import type { EstoqueItem, EstoqueLancamento } from "./estoque-store";
import {
  analisarContagem,
  ritmoContagem,
  type ResumoContagem,
  type RitmoContagem,
} from "./estoque-analytics";
import {
  buildValidadeRows,
  projetarVencimentos,
  resumirValidades,
  type ProjecaoVencimentos,
  type ResumoValidades,
  type ValidadeRow,
} from "./validity";
import { montarPendencias, type Pendencia } from "./pendencias";

export interface OcupacaoVestiario {
  vestiario: string;
  ocupados: number;
  livres: number;
  comPendencia: number;
  total: number;
}

export interface PainelGeral {
  geradoEm: number;
  janelaDias: number;
  validades: {
    rows: ValidadeRow[];
    resumo: ResumoValidades;
    projecao: ProjecaoVencimentos;
    /** Próximos a vencer (ainda válidos), do mais urgente para o menos. */
    proximos: ValidadeRow[];
  };
  armarios: {
    stats: LockerStats;
    porVestiario: OcupacaoVestiario[];
    inconsistencias: number;
  };
  estoque: {
    resumo: ResumoContagem;
    ritmo: RitmoContagem;
    iniciada: boolean;
  };
  pendencias: Pendencia[];
}

export interface EntradaPainel {
  historico: HistoryEntry[];
  janelaDias: number;
  armarios: Locker[];
  estoqueItens: EstoqueItem[];
  lancamentos: EstoqueLancamento[];
  hoje?: Date;
  mesesProjecao?: number;
}

/** Ocupação por vestiário — mostra onde há armário livre para alocar um novo colaborador. */
export function ocupacaoPorVestiario(list: Locker[]): OcupacaoVestiario[] {
  const m = new Map<string, OcupacaoVestiario>();
  for (const group of groupByPhysicalSlot(list)) {
    const l = group.find(isOcupado) ?? group[0];
    const ocupado = group.some(isOcupado);
    const pendencia = group.some(hasPendencia);
    const vestiario = l.vestiario?.trim() || "Sem vestiário";
    const g = m.get(vestiario) ?? { vestiario, ocupados: 0, livres: 0, comPendencia: 0, total: 0 };
    g.total++;
    if (ocupado) g.ocupados++;
    else g.livres++;
    if (pendencia) g.comPendencia++;
    m.set(vestiario, g);
  }
  return Array.from(m.values()).sort(
    (a, b) => b.total - a.total || a.vestiario.localeCompare(b.vestiario, "pt-BR"),
  );
}

/**
 * Fotografia única da operação para a Visão geral. Uma função pura, testável, para que todos os
 * números da tela inicial saiam da MESMA base (antes cada bloco recalculava por conta própria).
 */
export function montarPainelGeral(e: EntradaPainel): PainelGeral {
  const hoje = e.hoje ?? new Date();
  const rows = buildValidadeRows(e.historico, hoje, { janelaAtencaoDias: e.janelaDias });
  const proximos = rows
    .filter((r) => (r.status === "atencao" || r.status === "ok") && r.diasRestantes !== null)
    .slice(0, 6);
  const { resumo: resumoEstoque } = analisarContagem(e.estoqueItens, e.lancamentos);
  return {
    geradoEm: hoje.getTime(),
    janelaDias: e.janelaDias,
    validades: {
      rows,
      resumo: resumirValidades(rows),
      projecao: projetarVencimentos(rows, hoje, e.mesesProjecao ?? 6),
      proximos,
    },
    armarios: {
      stats: computeStats(e.armarios),
      porVestiario: ocupacaoPorVestiario(e.armarios),
      inconsistencias: e.armarios.length ? findInconsistencies(e.armarios).total : 0,
    },
    estoque: {
      resumo: resumoEstoque,
      ritmo: ritmoContagem(e.estoqueItens, e.lancamentos),
      iniciada: e.lancamentos.length > 0,
    },
    pendencias: montarPendencias({
      validades: rows,
      janelaDias: e.janelaDias,
      armarios: e.armarios,
      estoqueItens: e.estoqueItens,
      lancamentos: e.lancamentos,
    }),
  };
}
