import type { WorkBook } from "xlsx";
import { loadXlsx, type XlsxModule } from "./xlsx-lazy";
import { parseDateBR } from "./date-br";
import { normalizedName } from "./collaborator-preparation";
import { csvCell } from "./csv-safe";

export const TRAINING_NRS = ["01", "06", "12", "18"] as const;
export type TrainingNr = (typeof TRAINING_NRS)[number];
export type TrainingStatus = "declarado" | "nao_possui" | "comprovante" | "revisar";
export const TRAINING_LABELS: Record<TrainingStatus, string> = {
  declarado: "Possui — sem comprovação",
  nao_possui: "Não possui",
  comprovante: "Certificado não encontrado",
  revisar: "Verificar",
};
export interface TrainingRecord {
  id: string;
  origin: string;
  name: string;
  department: string;
  job: string;
  unit: "Matriz";
  nr: TrainingNr;
  sheet: string;
  row: number;
  hidden: boolean;
  raw: Record<string, string>;
  declaration: string;
  notes: string;
  dates: string[];
  status: TrainingStatus;
  expiry: null;
  importedAt: string;
  importedBy: string;
  file: string;
}
export interface TrainingState {
  records: TrainingRecord[];
  links: Record<string, string>;
}
export const emptyTrainingState = (): TrainingState => ({ records: [], links: {} });
function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
function text(v: unknown): string {
  if (v instanceof Date)
    return `${String(v.getDate()).padStart(2, "0")}/${String(v.getMonth() + 1).padStart(2, "0")}/${v.getFullYear()}`;
  return v == null ? "" : String(v);
}
export function classifyTraining(declaration: string, notes: string): TrainingStatus {
  const n = normalizedName(notes),
    d = normalizedName(declaration);
  if (/certificado nao encontrado/.test(n)) return "comprovante";
  if (/verificar|vencid|nao encontrado/.test(n)) return "revisar";
  if (/nao (possui|tem)/.test(d)) return "nao_possui";
  if (/possui/.test(d)) return "declarado";
  return "revisar";
}
export function parseTrainingWorkbook(
  workbook: WorkBook,
  file: string,
  importedBy: string,
  importedAt: string,
  utils: XlsxModule["utils"],
): TrainingRecord[] {
  const records: TrainingRecord[] = [];
  for (const sheet of workbook.SheetNames) {
    const code = sheet.match(/NR\s*-?\s*0?(1|6|12|18)\b/i)?.[1]?.padStart(2, "0");
    const nr = TRAINING_NRS.find((n) => n === code);
    if (!nr) continue;
    const ws = workbook.Sheets[sheet];
    const rows = utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: "",
      blankrows: true,
      skipHidden: false,
    });
    const headers = (rows[0] ?? []).map(text);
    const field = (row: unknown[], pattern: RegExp) =>
      text(row[headers.findIndex((h) => pattern.test(normalizedName(h)))]);
    rows.slice(1).forEach((row, index) => {
      const name = field(row, /^nome(?: funcionario)?$/).trim();
      if (!name) return;
      const raw: Record<string, string> = {};
      row.forEach((v, i) => {
        if (text(v) || headers[i]?.trim())
          raw[`${utils.encode_col(i)} · ${headers[i] || "Sem cabeçalho"}`] = text(v);
      });
      const declaration = field(row, /status nr/);
      const notes = headers
        .map((h, i) =>
          /^(obs\.?|status$|data de emissao)/.test(normalizedName(h)) ? text(row[i]) : "",
        )
        .filter(Boolean)
        .join(" · ");
      const matches = notes.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g) ?? [];
      const dates = [...new Set(matches.filter((d) => parseDateBR(d)))];
      // A linha da planilha é a chave da origem. O nome é um dado corrigível, não uma identidade.
      const origin = `${sheet}:${index + 2}`;
      records.push({
        id: `${origin}:${hash(JSON.stringify(raw))}`,
        origin,
        name,
        department: field(row, /departamento/),
        job: field(row, /funcao|funcoes/),
        unit: "Matriz",
        nr,
        sheet,
        row: index + 2,
        hidden: Boolean(ws["!rows"]?.[index + 1]?.hidden),
        raw,
        declaration,
        notes,
        dates,
        status: classifyTraining(declaration, notes),
        expiry: null,
        importedAt,
        importedBy,
        file,
      });
    });
  }
  if (!records.length)
    throw new Error("Nenhum registro encontrado nas abas NR-01, NR-06, NR-12 e NR-18.");
  return records;
}
export async function readTrainingFile(file: File, userId: string): Promise<TrainingRecord[]> {
  const XLSX = await loadXlsx();
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: "array",
    cellDates: true,
    cellStyles: true,
  });
  return parseTrainingWorkbook(workbook, file.name, userId, new Date().toISOString(), XLSX.utils);
}
export function mergeTrainingRecords(
  state: TrainingState,
  incoming: TrainingRecord[],
): TrainingState {
  const known = new Set(state.records.map((r) => r.id));
  return {
    ...state,
    records: [
      ...state.records,
      ...incoming.filter((r) => {
        if (known.has(r.id)) return false;
        known.add(r.id);
        return true;
      }),
    ],
  };
}
export function latestTrainingRecords(records: TrainingRecord[]): TrainingRecord[] {
  const byOrigin = new Map<string, TrainingRecord>();
  for (const record of records) {
    const source = `${record.sheet}:${record.row}`;
    const current = byOrigin.get(source);
    const currentTime = current ? Date.parse(current.importedAt) : Number.NEGATIVE_INFINITY;
    const recordTime = Date.parse(record.importedAt);
    const currentOrder = Number.isFinite(currentTime) ? currentTime : Number.NEGATIVE_INFINITY;
    const recordOrder = Number.isFinite(recordTime) ? recordTime : Number.NEGATIVE_INFINITY;
    // A persistência conserva histórico; o estado atual deve ser escolhido pela data, não pela
    // posição do registro no JSON. Em empate, a última linha recebida continua prevalecendo.
    if (!current || recordOrder >= currentOrder) byOrigin.set(source, record);
  }
  return [...byOrigin.values()];
}
export function trainingPeople(state: TrainingState) {
  const groups = new Map<string, TrainingRecord[]>();
  const linksBySource = new Map<string, string>();
  for (const record of state.records) {
    const source = `${record.sheet}:${record.row}`;
    const link = state.links[record.origin];
    if (link && !linksBySource.has(source)) linksBySource.set(source, link);
  }
  for (const r of latestTrainingRecords(state.records)) {
    const source = `${r.sheet}:${r.row}`;
    const id = state.links[r.origin] || linksBySource.get(source) || r.origin;
    groups.set(id, [...(groups.get(id) ?? []), r]);
  }
  return [...groups]
    .map(([id, records]) => ({
      id,
      name: records[0].name,
      department: records.find((r) => r.department)?.department || "",
      job: records.find((r) => r.job)?.job || "",
      records,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/** Recupera um vínculo manual de uma versão histórica da mesma linha da planilha. */
export function grupoTreinamentoVinculado(state: TrainingState, record: TrainingRecord) {
  if (state.links[record.origin]) return state.links[record.origin];
  const source = `${record.sheet}:${record.row}`;
  return state.records
    .filter((item) => `${item.sheet}:${item.row}` === source)
    .map((item) => state.links[item.origin])
    .find(Boolean);
}

const TRAINING_REVIEW_STATUSES: readonly TrainingStatus[] = [
  "declarado",
  "nao_possui",
  "comprovante",
  "revisar",
];

/** Todos os estados atuais exigem ação; nenhum representa conformidade documental confirmada. */
export function requerAcaoTreinamento(status: TrainingStatus): boolean {
  return TRAINING_REVIEW_STATUSES.includes(status);
}

export function trainingRecordMatches(record: TrainingRecord, nr: string, status: string): boolean {
  return (
    (nr === "all" || record.nr === nr) &&
    (status === "all" ||
      (status === "pending" ? requerAcaoTreinamento(record.status) : record.status === status))
  );
}

export function filterTrainingRecords(
  records: TrainingRecord[],
  nr: string,
  status: string,
): TrainingRecord[] {
  return records.filter((record) => trainingRecordMatches(record, nr, status));
}

export interface ResumoMatrizTreinamentos {
  registros: number;
  emAberto: number;
  nomesParaConferir: number;
  porStatus: Record<TrainingStatus, number>;
  porNr: Array<{ nr: TrainingNr; total: number; porStatus: Record<TrainingStatus, number> }>;
}

/** Agrega as linhas atuais da planilha sem convertê-las em pessoas ou certificados emitidos. */
export function resumirMatrizTreinamentos(state: TrainingState): ResumoMatrizTreinamentos {
  const records = latestTrainingRecords(state.records);
  const porStatus: Record<TrainingStatus, number> = {
    declarado: 0,
    nao_possui: 0,
    comprovante: 0,
    revisar: 0,
  };
  const porNr = TRAINING_NRS.map((nr) => ({
    nr,
    total: 0,
    porStatus: { declarado: 0, nao_possui: 0, comprovante: 0, revisar: 0 },
  }));

  for (const record of records) {
    porStatus[record.status] += 1;
    const norm = porNr.find((item) => item.nr === record.nr);
    if (norm) {
      norm.total += 1;
      norm.porStatus[record.status] += 1;
    }
  }

  const porNome = new Map<string, number>();
  for (const person of trainingPeople({ ...state, records })) {
    const key = normalizedName(person.name);
    if (key) porNome.set(key, (porNome.get(key) ?? 0) + 1);
  }

  return {
    registros: records.length,
    emAberto: records.filter((record) => requerAcaoTreinamento(record.status)).length,
    nomesParaConferir: [...porNome.values()].filter((quantidade) => quantidade > 1).length,
    porStatus,
    porNr,
  };
}

export function linkTrainingOrigins(
  state: TrainingState,
  origins: string[],
  group: string,
): TrainingState {
  const links = { ...state.links };
  origins.forEach((origin) => {
    links[origin] = group;
  });
  return { ...state, links };
}
export function trainingCsv(records: TrainingRecord[]): string {
  return (
    "\ufeff" +
    [
      [
        "Nome",
        "Unidade",
        "Setor",
        "Função",
        "NR",
        "Situação",
        "Datas originais",
        "Observações",
        "Aba",
        "Linha",
      ],
      ...records.map((r) => [
        r.name,
        r.unit,
        r.department,
        r.job,
        `NR-${r.nr}`,
        TRAINING_LABELS[r.status],
        r.dates.join(" · "),
        r.notes,
        r.sheet,
        String(r.row),
      ]),
    ]
      .map((row) => row.map(csvCell).join(";"))
      .join("\r\n")
  );
}
