// Metadados do template Volga - NR 06 (5 certificados por arquivo)
// Os nomes e CPFs abaixo são FICTÍCIOS: o modelo público não pode conter dados reais.
// Cada slot corresponde às strings originais que existem no PPTX modelo.

export const TEMPLATE_URL = "/templates/certificado-volga-nr06.pptx";

export interface SlotOriginal {
  slideFile: string; // ex: "ppt/slides/slide1.xml"
  nomeUpper: string; // string exata do nome em CAIXA ALTA no template
  nomeSignature: string; // string exata do nome capitalizado (assinatura)
  cpf: string; // string exata do CPF no template
  regLine: string; // linha "Reg: ..." exata (varia em espaços)
}

export const SLOTS: SlotOriginal[] = [
  {
    slideFile: "ppt/slides/slide1.xml",
    nomeUpper: "    PEDRO EXEMPLO ROCHA",
    nomeSignature: "Pedro Exemplo Rocha",
    cpf: "000.000.000-00",
    regLine: "Reg:   0028038/GO ",
  },
  {
    slideFile: "ppt/slides/slide3.xml",
    nomeUpper: "    JOAO EXEMPLO DA ALVES",
    nomeSignature: "Ana Da Exemplo Pereira",
    cpf: "000.000.000-00",
    regLine: "Reg:   0028038/GO ",
  },
  {
    slideFile: "ppt/slides/slide5.xml",
    nomeUpper: "  LUCIA EXEMPLO NUNES",
    nomeSignature: "Carla Exemplo Pinto",
    cpf: "000.000.000-00",
    regLine: "Reg:  0028038/GO ",
  },
  {
    slideFile: "ppt/slides/slide7.xml",
    nomeUpper: "PAULO EXEMPLO MOURA",
    nomeSignature: "Carla Exemplo Pinto",
    cpf: "000.000.000-00",
    regLine: "Reg:  0028038/GO ",
  },
  {
    slideFile: "ppt/slides/slide9.xml",
    nomeUpper: "MARIA DE EXEMPLO COSTA ALVES",
    nomeSignature: "Maria de Exemplo Costa Alves",
    cpf: "000.000.000-00",
    regLine: "Reg:  0028038/GO ",
  },
];

// Parágrafo original do corpo do certificado (idêntico em todos os slides)
export const ORIGINAL_BODY =
  "Participou e concluiu o Treinamento sobre Uso Correto, Guarda e Conservação de EPI - Equipamento de Proteção Individual (teórico e prático), realizado em 15 de junho de 2026, com duração de 2 (duas) horas, pela empresa VOLGA ENGENHARIA INDUSTRIA E COMERCIO LTDA,  na Av. Elmar Arantes Cabral, SN, Quadra 001, Lote 5, Parque Industrial Vice-Presidente José Alencar, Aparecida de Goiânia-GO inscrita no CNPJ: 03.347.463/0001-12. em conformidade com a norma regulamentadora Nº 06, item 6.6.1 letra D. ";

export const ORIGINAL_INSTRUTOR = "Kayque Souza De Oliveira";
export const ORIGINAL_INSTRUTOR_CARGO = " Téc. Segurança do Trabalho";

export interface SharedFields {
  /** PPTX original usado como base visual do modelo, quando disponível. */
  templateUrl?: string;
  treinamento: string;
  data: string;
  cargaHoraria: string;
  empresa: string;
  endereco: string;
  cnpj: string;
  normaRef: string;
  instrutorNome: string;
  instrutorCargo: string;
  instrutorRegistro: string;
  /**
   * Instrutor opcional para a assinatura do MEIO, quando o modelo tem mais de
   * um bloco de assinatura de instrutor (ex.: Engenheiro + Técnico). Quando
   * vazio, a coluna do meio usa o mesmo instrutor principal (comportamento
   * anterior, preservado).
   */
  instrutorMeioNome?: string;
  instrutorMeioCargo?: string;
  instrutorMeioRegistro?: string;
  /** Lista de tópicos do Conteúdo Programático (verso do certificado). */
  conteudoProgramatico: string[];
  /**
   * Validade do treinamento em meses, usada para calcular quando os
   * certificados gerados a partir deste modelo vencem (painel Validades).
   * Quando ausente/0, é tratado como "sem prazo de reciclagem definido".
   */
  validadeMeses?: number;
}

/**
 * Sugestão de periodicidade (em meses) por norma, usada apenas como valor
 * inicial ao editar "Validade (meses)" — o usuário pode ajustar livremente.
 */
export const NR_VALIDADE_MESES_SUGERIDA: Record<string, number> = {
  "06": 0,
  "10": 24,
  "12": 24,
  "18": 12,
  "20": 12,
  "33": 12,
  "35": 12,
};

/** Extrai o número da NR (ex.: "06") de um texto livre como "Nº 06, item 6.6.1 letra D". */
export function extractNrCode(normaRef: string): string | null {
  const m = normaRef.match(/N[ºo°.]*\s*(\d{1,2})/i);
  return m ? m[1].padStart(2, "0") : null;
}

/** Sugestão de validade (meses) a partir do texto livre de "Norma / Referência". */
export function suggestValidadeMeses(normaRef: string): number | undefined {
  const code = extractNrCode(normaRef);
  if (!code) return undefined;
  return NR_VALIDADE_MESES_SUGERIDA[code];
}

export interface Colaborador {
  nome: string;
  cpf: string;
  /** false = excluído da geração mesmo estando preenchido (default: true). */
  incluir?: boolean;
}

export const DEFAULT_CONTEUDO_PROGRAMATICO: string[] = [
  "Normas e legislação aplicadas - NR 06;",
  "Normas internas : Uso obrigatório dos EPI;",
  "Responsabilidades do empregador;",
  "Responsabilidades do empregado;",
  "Uso adequado dos equipamentos de proteção individual - EPI;",
  "Informações sobre os equipamentos de proteção coletiva - EPC;",
  "Conscientização ao uso correto dos EPI\u2019s;",
  "Penalidades na recusa do uso do EPI;",
  "Periodicidade da troca do EPI.",
];

export const DEFAULT_SHARED: SharedFields = {
  treinamento:
    "Uso Correto, Guarda e Conservação de EPI - Equipamento de Proteção Individual (teórico e prático)",
  data: "15 de junho de 2026",
  cargaHoraria: "2 (duas) horas",
  empresa: "VOLGA ENGENHARIA INDUSTRIA E COMERCIO LTDA",
  endereco:
    "Av. Elmar Arantes Cabral, SN, Quadra 001, Lote 5, Parque Industrial Vice-Presidente José Alencar, Aparecida de Goiânia-GO",
  cnpj: "03.347.463/0001-12",
  normaRef: "Nº 06, item 6.6.1 letra D",
  instrutorNome: "Kayque Souza De Oliveira",
  instrutorCargo: "Téc. Segurança do Trabalho",
  instrutorRegistro: "0028038/GO",
  conteudoProgramatico: DEFAULT_CONTEUDO_PROGRAMATICO,
};

// Lista inicial vazia: nenhum dado pessoal (nome/CPF) fica embutido no código.
export const DEFAULT_COLABORADORES: Colaborador[] = [{ nome: "", cpf: "" }];

/** Garante compatibilidade com modelos/rascunhos antigos sem campos novos. */
export function normalizeShared(s: Partial<SharedFields> | null | undefined): SharedFields {
  const base = { ...DEFAULT_SHARED, ...(s ?? {}) };
  if (!Array.isArray(base.conteudoProgramatico) || base.conteudoProgramatico.length === 0) {
    base.conteudoProgramatico = [...DEFAULT_CONTEUDO_PROGRAMATICO];
  }
  if (typeof base.validadeMeses !== "number" || Number.isNaN(base.validadeMeses)) {
    base.validadeMeses = suggestValidadeMeses(base.normaRef) ?? 12;
  }
  return base;
}

export function buildBody(s: SharedFields): string {
  return `Participou e concluiu o Treinamento sobre ${s.treinamento}, realizado em ${s.data}, com duração de ${s.cargaHoraria}, pela empresa ${s.empresa},  na ${s.endereco} inscrita no CNPJ: ${s.cnpj}. em conformidade com a norma regulamentadora ${s.normaRef}. `;
}

// Escape XML para inserir texto seguro
export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Substitui todas ocorrências (sem regex escape hell)
export function replaceAll(haystack: string, needle: string, repl: string): string {
  return haystack.split(needle).join(repl);
}

/**
 * Formata um nome como "Primeira Letra Maiúscula" preservando conectores
 * ("de", "da", "do", "dos", "das", "e") em minúsculas. Aceita entrada em
 * qualquer caixa (tudo maiúsculo, tudo minúsculo, misturado).
 */
export function formatSignatureName(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) =>
      ["de", "da", "do", "dos", "das", "e"].includes(w) ? w : w[0].toUpperCase() + w.slice(1),
    )
    .join(" ");
}
