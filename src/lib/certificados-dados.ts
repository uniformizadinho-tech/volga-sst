/**
 * Partes leves da geração de certificados (limites, rótulos e montagem de listas).
 * Ficam separadas dos geradores (PowerPoint/PDF), que são pesados e só são
 * baixados quando a pessoa clica em gerar.
 */
import { SLOTS, type Colaborador } from "./certificate-template";

export const MAX_COLABORADORES = 300;
export const CHUNK_SIZE = SLOTS.length;

export class GenerationAbortedError extends Error {
  constructor() {
    super("Geração cancelada");
    this.name = "GenerationAbortedError";
  }
}

// Tipo mantido por compatibilidade com a UI existente.
export type AnuenciaNr = "nr10" | "nr12" | "nr33" | "nr35";

export interface AnuenciaSelection {
  cpf: string;
  nome: string;
  /** Caixas a marcar nesta carta (sobrepõe a seleção global). */
  nrs?: Partial<Record<AnuenciaNr, boolean>>;
}

export const ANUENCIA_NR_LABELS: Record<AnuenciaNr, string> = {
  nr10: "NR-10 — Intervenções em Sistema Elétrico de Potência",
  nr12: "NR-12 — Atividades com máquinas e equipamentos",
  nr33: "NR-33 — Atividades em Espaço Confinado",
  nr35: "NR-35 — Atividades em Altura",
};

export function anuenciaFromColaboradores(
  cols: Colaborador[],
  _selections?: Record<number, Partial<Record<AnuenciaNr, boolean>>>,
): AnuenciaSelection[] {
  return cols.map((c) => ({ cpf: c.cpf.trim(), nome: c.nome.trim() })).filter((e) => e.nome);
}

export interface RegraDeOuroSelection {
  cpf: string;
  nome: string;
}

export function regrasDeOuroFromColaboradores(cols: Colaborador[]): RegraDeOuroSelection[] {
  return cols.map((c) => ({ cpf: c.cpf.trim(), nome: c.nome.trim() })).filter((e) => e.nome);
}
