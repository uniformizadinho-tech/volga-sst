/** Inspeção mensal de combate a incêndio — regras puras + armazenamento compartilhado. */
import { saveSharedSnapshot } from "@/lib/shared-kv";
import { recordOperation } from "@/lib/operation-audit";

export const SETORES = [
  "Administrativo 1º piso",
  "Administrativo 2º piso",
  "Produção",
  "Almoxarifado",
  "Metalúrgica",
  "ETE / Químicos",
  "Resíduos / Gás",
  "Área Externa",
  "Refeitório",
  "Portaria",
  "Manutenção",
  "Expedição",
  "Recebimento",
  "Laboratório",
  "Vestiários",
  "Alarmes",
  "Casa de Bombas",
] as const;

export type TipoEquip =
  "extintor" | "hidrante" | "alarme" | "bomba" | "iluminacao" | "sinalizacao" | "misto";
export const TIPO_LABEL: Record<TipoEquip, string> = {
  extintor: "Extintor",
  hidrante: "Hidrante / Mangueira",
  alarme: "Alarme / Iluminação",
  bomba: "Casa de Bombas",
  iluminacao: "Iluminação de emergência",
  sinalizacao: "Sinalização",
  misto: "Ponto com múltiplos itens",
};

export const CHECKLIST: Record<TipoEquip, string[]> = {
  extintor: [
    "Lacre intacto",
    "Manômetro na faixa verde",
    "Sinalização visível",
    "Acesso desobstruído",
    "Mangote e bico em bom estado",
    "Suporte / fixação correta",
    "Pintura de piso",
    "Etiqueta legível",
  ],
  hidrante: [
    "Mangueira acondicionada",
    "Esguicho presente",
    "Chave storz presente",
    "Abrigo sem danos",
    "Sinalização visível",
    "Acesso desobstruído",
    "Registro sem vazamento",
  ],
  alarme: [
    "Central sem falhas",
    "Acionadores manuais íntegros",
    "Sirene audível",
    "Luzes de emergência funcionando",
    "Baterias carregadas",
  ],
  bomba: [
    "Bomba principal parte",
    "Bomba jockey opera",
    "Pressão no manômetro",
    "Sem vazamentos",
    "Painel em automático",
    "Tanque/reservatório nível ok",
  ],
  iluminacao: [
    "Luminária presente no ponto",
    "Luminária e fixação íntegras",
    "Acendimento em falta de energia verificado",
    "Bateria / alimentação verificada",
    "Iluminação da rota sem obstrução",
  ],
  sinalizacao: [
    "Placa presente no ponto",
    "Identificação compatível com o local",
    "Sinalização legível e visível",
    "Fixação íntegra",
    "Rota indicada desobstruída",
  ],
  misto: [
    "Itens previstos presentes no ponto",
    "Identificação visível",
    "Acesso desobstruído",
    "Instalação sem danos aparentes",
  ],
};

export interface Equipamento {
  id: string;
  codigo: string;
  tipo: TipoEquip;
  setor: string;
  local: string;
  classe?: string;
  capacidade?: string;
  vencRecarga?: string;
  vencTesteHidro?: string;
  ativo: boolean;
  nome?: string;
  projeto?: string;
  referencia?: string;
  revisaoNecessaria?: boolean;
  checklistCadastro?: Record<string, Resposta>;
  pendencias?: PendenciaEquipamento[];
  levantamento?: {
    item: string;
    descricao: string;
    status: string;
    prioridade: string;
    projeto: string;
    acao: string;
    referencia: string;
    observacoes: string;
    notas: string;
  };
}
export type Resposta = "ok" | "nc" | "na";
export type NivelPendencia = "baixo" | "medio" | "alto" | "critico";
export interface PendenciaEquipamento {
  id: string;
  descricao: string;
  nivel: NivelPendencia;
  acao: string;
  situacao: "aberta" | "andamento" | "resolvida";
  responsavel?: string;
  prazo?: string;
  itemChecklist?: string;
  origem: "planilha" | "cadastro" | "inspecao";
  correcao?: string;
  resolvidaEm?: string;
}
export interface Inspecao {
  id: string;
  equipamentoId: string;
  data: string;
  inspetor: string;
  respostas: Record<string, Resposta>;
  observacao: string;
  foto?: string;
  acaoCorretiva?: string;
  responsavel?: string;
  prazo?: string;
  corrigidoEm?: string;
  correcao?: string;
}
export interface InspecoesDB {
  equipamentos: Equipamento[];
  inspecoes: Inspecao[];
}

const KEY = "volga:inspecoes:v1";
export function loadDB(): InspecoesDB {
  if (typeof window === "undefined") return { equipamentos: [], inspecoes: [] };
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    if (v && Array.isArray(v.equipamentos) && Array.isArray(v.inspecoes)) return v;
  } catch {
    /* corrompido */
  }
  return { equipamentos: [], inspecoes: [] };
}
export async function saveDB(db: InspecoesDB): Promise<void> {
  try {
    await saveSharedSnapshot(KEY, JSON.stringify(db));
    void recordOperation({
      module: "INSPECOES",
      action: "SAVE",
      entityType: "inspection_database",
      result: "success",
      description: "Cadastro de inspeções sincronizado com a equipe.",
      metadata: { equipamentos: db.equipamentos.length, inspecoes: db.inspecoes.length },
    });
  } catch (error) {
    void recordOperation({
      module: "INSPECOES",
      action: "SAVE",
      entityType: "inspection_database",
      result: error instanceof Error && /Outra pessoa/.test(error.message) ? "conflict" : "error",
      description:
        error instanceof Error ? error.message : "Falha ao salvar o cadastro de inspeções.",
    });
    throw error;
  }
}

export const mesDe = (iso: string) => iso.slice(0, 7);
export const temNC = (i: Inspecao) => Object.values(i.respostas).includes("nc");
/** NC ainda não corrigida. */
export const ncAberta = (i: Inspecao) => temNC(i) && !i.corrigidoEm;

/** Dias até a data (negativo = vencido). */
export function diasAte(iso: string | undefined, hoje = new Date()): number | null {
  if (!iso) return null;
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const d = new Date(iso + "T00:00:00");
  if (
    isNaN(+d) ||
    d.getFullYear() !== Number(match[1]) ||
    d.getMonth() + 1 !== Number(match[2]) ||
    d.getDate() !== Number(match[3])
  )
    return null;
  const h = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((+d - +h) / 86400000);
}

export type StatusVenc = "vencido" | "vence30" | "ok" | "sem";
export function statusVencimento(e: Equipamento, hoje = new Date()): StatusVenc {
  const ds = [diasAte(e.vencRecarga, hoje), diasAte(e.vencTesteHidro, hoje)].filter(
    (x): x is number => x !== null,
  );
  if (!ds.length) return "sem";
  const m = Math.min(...ds);
  if (m < 0) return "vencido";
  if (
    e.tipo === "extintor" &&
    (diasAte(e.vencRecarga, hoje) === null || diasAte(e.vencTesteHidro, hoje) === null)
  ) {
    return "sem";
  }
  if (m <= 30) return "vence30";
  return "ok";
}

export function ultimaInspecao(db: InspecoesDB, equipId: string): Inspecao | undefined {
  return db.inspecoes
    .filter((i) => i.equipamentoId === equipId)
    .sort((a, b) => b.data.localeCompare(a.data))[0];
}

/** Resumo do mês: cobertura (equipamentos ativos inspecionados no mês) e não conformidades abertas. */
export function resumoMes(db: InspecoesDB, mes: string, hoje = new Date()) {
  const ativos = db.equipamentos.filter((e) => e.ativo);
  const inspecionados = new Set(
    db.inspecoes.filter((i) => mesDe(i.data) === mes).map((i) => i.equipamentoId),
  );
  const feitos = ativos.filter((e) => inspecionados.has(e.id)).length;
  const comNC = ativos.filter((e) =>
    db.inspecoes.some((i) => i.equipamentoId === e.id && ncAberta(i)),
  );
  return {
    total: ativos.length,
    feitos,
    pendentes: ativos.length - feitos,
    cobertura: ativos.length ? Math.round((feitos / ativos.length) * 100) : 0,
    naoConformes: comNC.length,
    vencidos: ativos.filter((e) => statusVencimento(e, hoje) === "vencido").length,
  };
}

export const novoId = () =>
  crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());

const CSV_COLS = [
  "codigo",
  "tipo",
  "setor",
  "local",
  "classe",
  "capacidade",
  "vencRecarga",
  "vencTesteHidro",
] as const;
export function equipamentosToCSV(list: Equipamento[]): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [
    CSV_COLS.join(";"),
    ...list.filter((e) => e.ativo).map((e) => CSV_COLS.map((c) => esc(e[c])).join(";")),
  ].join("\n");
}
/** Lê CSV (; ou ,) com cabeçalho; ignora linhas sem código ou tipo inválido. */
export function equipamentosFromCSV(txt: string): Equipamento[] {
  const lines = txt
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes(";") ? ";" : ",";
  const split = (l: string) =>
    (l.match(new RegExp(`("([^"]|"")*"|[^${sep}]*)(${sep}|$)`, "g")) ?? []).slice(0, -1).map((c) =>
      c
        .replace(new RegExp(`${sep}$`), "")
        .replace(/^"|"$/g, "")
        .replace(/""/g, '"')
        .trim(),
    );
  const head = split(lines[0]).map((h) => h.toLowerCase());
  const idx = (k: string) => head.indexOf(k.toLowerCase());
  const out: Equipamento[] = [];
  for (const l of lines.slice(1)) {
    const c = split(l);
    const g = (k: string) => (idx(k) >= 0 ? (c[idx(k)] ?? "") : "");
    const tipo = g("tipo").toLowerCase() as TipoEquip;
    if (!g("codigo") || !(tipo in TIPO_LABEL)) continue;
    out.push({
      id: novoId(),
      codigo: g("codigo").toUpperCase(),
      tipo,
      setor: g("setor") || SETORES[0],
      local: g("local"),
      classe: g("classe") || undefined,
      capacidade: g("capacidade") || undefined,
      vencRecarga: g("vencRecarga") || undefined,
      vencTesteHidro: g("vencTesteHidro") || undefined,
      ativo: true,
    });
  }
  return out;
}
