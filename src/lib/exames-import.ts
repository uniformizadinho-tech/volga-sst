import Papa from "papaparse";
import { loadXlsx } from "./xlsx-lazy";
import {
  parseExamDate,
  parseValidityMonths,
  dueDateFromPeriod,
  type ExamCategory,
  type ExamDraft,
} from "./exames";

export const EXAMS_IMPORT_ACCEPT = ".csv,.xlsx,.xls,.ods";

export interface ExamImportIssue {
  row: number;
  reason: string;
}

export interface ExamImportPreview {
  records: ExamDraft[];
  rejected: ExamImportIssue[];
  duplicateCandidates: number;
  sourceRows: number;
  missingPerformedDate: number;
  invalidPerformedDate: number;
  invalidDueDate: number;
  withoutDueDate: number;
}

const ALIASES: Record<string, string[]> = {
  company: ["empresa", "company"],
  employeeName: ["funcionario", "colaborador", "nome", "empregado", "employee"],
  examCategory: ["tipo", "categoria", "tipodeexame"],
  provider: ["fornecedor", "prestador", "clinica", "provider"],
  serviceLocation: [
    "localunidadedeatendimento",
    "localunidadeatendimento",
    "local",
    "unidade",
    "localdeatendimento",
  ],
  examName: ["exame", "nomeexame", "exam", "examname"],
  specificType: ["tipoespecifico", "tipoespecificoexame", "motivo", "tipoespecifico"],
  performedOn: ["data", "datarealizado", "datarealizacao", "datadeexecucao", "performedon"],
  validity: ["prazoproximo", "prazo", "validade", "periodo", "validademeses"],
  dueOn: ["dataproximo", "proximadata", "datavencimento", "vencimento", "dueon"],
  orderReference: ["ordem", "referencia", "pedido", "order"],
};

function headerKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]/g, "");
}

function categoryFrom(value: unknown): ExamCategory {
  const key = headerKey(value).replace(/\s/g, "");
  if (key.startsWith("clinico")) return "Clínico";
  if (key.startsWith("complementar")) return "Complementar";
  return "Outro";
}

function valueAt(row: unknown[], index: number | undefined): unknown {
  return index === undefined ? "" : (row[index] ?? "");
}

function signature(draft: ExamDraft): string {
  return [
    draft.company,
    draft.employeeName,
    draft.examCategory,
    draft.examName,
    draft.specificType,
    draft.performedOn,
    draft.dueOn ?? "",
    draft.provider,
    draft.serviceLocation,
    draft.orderReference,
  ]
    .map((part) => headerKey(part))
    .join("|");
}

export function parseExamMatrix(matrix: unknown[][]): ExamImportPreview {
  const preview: ExamImportPreview = {
    records: [],
    rejected: [],
    duplicateCandidates: 0,
    sourceRows: 0,
    missingPerformedDate: 0,
    invalidPerformedDate: 0,
    invalidDueDate: 0,
    withoutDueDate: 0,
  };
  const headerIndex = matrix.findIndex((row) => {
    const keys = new Set((row ?? []).map(headerKey));
    const hasEmployee = (ALIASES.employeeName ?? []).some((key) => keys.has(key));
    const hasExam = (ALIASES.examName ?? []).some((key) => keys.has(key));
    const hasDate = (ALIASES.performedOn ?? []).some((key) => keys.has(key));
    return hasEmployee && hasExam && hasDate;
  });
  if (headerIndex < 0) {
    preview.rejected.push({
      row: 1,
      reason: "Não encontrei cabeçalho com Funcionário, Exame e Data.",
    });
    return preview;
  }

  const header = (matrix[headerIndex] ?? []).map(headerKey);
  const indexFor = (field: string) => {
    const aliases = ALIASES[field] ?? [];
    return header.findIndex((key) => aliases.includes(key));
  };
  const ix = {
    company: indexFor("company"),
    employeeName: indexFor("employeeName"),
    examCategory: indexFor("examCategory"),
    provider: indexFor("provider"),
    serviceLocation: indexFor("serviceLocation"),
    examName: indexFor("examName"),
    specificType: indexFor("specificType"),
    performedOn: indexFor("performedOn"),
    validity: indexFor("validity"),
    dueOn: indexFor("dueOn"),
    orderReference: indexFor("orderReference"),
  };
  const seen = new Map<string, number>();
  const body = matrix.slice(headerIndex + 1);

  body.forEach((row, bodyIndex) => {
    const cells = row ?? [];
    if (!cells.some((cell) => String(cell ?? "").trim())) return;
    preview.sourceRows += 1;
    const rowNumber = headerIndex + bodyIndex + 2;
    const employeeName = String(valueAt(cells, ix.employeeName)).trim();
    const company = String(valueAt(cells, ix.company)).trim();
    const examName = String(valueAt(cells, ix.examName)).trim();
    const performedRaw = String(valueAt(cells, ix.performedOn)).trim();
    const performedOn = parseExamDate(valueAt(cells, ix.performedOn)) ?? "";
    const dueRaw = String(valueAt(cells, ix.dueOn)).trim();
    const dueFromFile = dueRaw ? parseExamDate(dueRaw) : null;
    const validityMonths = parseValidityMonths(valueAt(cells, ix.validity));
    if (!employeeName) {
      preview.rejected.push({ row: rowNumber, reason: "Nome do colaborador ausente." });
      return;
    }
    if (!company) {
      preview.rejected.push({ row: rowNumber, reason: "Empresa ausente." });
      return;
    }
    if (!examName) {
      preview.rejected.push({ row: rowNumber, reason: "Nome do exame ausente." });
      return;
    }
    if (!performedOn) preview.missingPerformedDate += 1;
    if (!performedOn && performedRaw) preview.invalidPerformedDate += 1;
    if (dueRaw && !dueFromFile) preview.invalidDueDate += 1;

    const resolvedDueDate =
      dueFromFile ?? (performedOn ? dueDateFromPeriod(performedOn, validityMonths) : null);
    const draft: ExamDraft = {
      employeeName,
      company,
      examCategory: categoryFrom(valueAt(cells, ix.examCategory)),
      provider: String(valueAt(cells, ix.provider)).trim(),
      serviceLocation: String(valueAt(cells, ix.serviceLocation)).trim(),
      examName,
      specificType: String(valueAt(cells, ix.specificType)).trim(),
      performedOn,
      validityMonths,
      dueOn: resolvedDueDate,
      dueDateOrigin: dueFromFile
        ? "importado"
        : performedOn && validityMonths
          ? "calculado"
          : "nenhum",
      orderReference: String(valueAt(cells, ix.orderReference)).trim(),
    };
    if (!draft.dueOn) preview.withoutDueDate += 1;
    const key = signature(draft);
    const occurrence = seen.get(key) ?? 0;
    if (occurrence > 0) preview.duplicateCandidates += 1;
    seen.set(key, occurrence + 1);
    draft.sourceOccurrence = occurrence;
    preview.records.push(draft);
  });
  return preview;
}

function decodeCsv(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  return (utf8.includes("\uFFFD") ? new TextDecoder("windows-1252").decode(bytes) : utf8).replace(
    /^\uFEFF/,
    "",
  );
}

export async function parseExamImportFile(file: File): Promise<ExamImportPreview> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (/\.(xlsx|xls|ods)$/i.test(file.name)) {
    const XLSX = await loadXlsx();
    const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
    for (const sheetName of workbook.SheetNames) {
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
        header: 1,
        defval: "",
        raw: false,
      });
      const result = parseExamMatrix(matrix);
      if (result.records.length || result.sourceRows) return result;
    }
    return {
      records: [],
      rejected: [{ row: 1, reason: "Nenhuma aba contém a lista de exames." }],
      duplicateCandidates: 0,
      sourceRows: 0,
      missingPerformedDate: 0,
      invalidPerformedDate: 0,
      invalidDueDate: 0,
      withoutDueDate: 0,
    };
  }
  const csv = Papa.parse<unknown[]>(decodeCsv(bytes), {
    header: false,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
  });
  return parseExamMatrix(csv.data);
}
