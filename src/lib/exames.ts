export type ExamCategory = "Clínico" | "Complementar" | "Outro";
export type ExamStatus = "vencido" | "atencao" | "em_dia" | "sem_prazo";
export type DueDateOrigin = "importado" | "calculado" | "manual" | "nenhum";

export interface ExamDraft {
  employeeName: string;
  company: string;
  examCategory: ExamCategory;
  provider: string;
  serviceLocation: string;
  examName: string;
  specificType: string;
  performedOn: string;
  validityMonths: number | null;
  dueOn: string | null;
  dueDateOrigin: DueDateOrigin;
  orderReference: string;
  sourceOccurrence?: number;
}

export interface ExamRecord extends ExamDraft {
  id: string;
  fingerprint: string;
  revision: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExamSummary {
  total: number;
  expired: number;
  dueSoon: number;
  noDueDate: number;
}

export const DEFAULT_EXAM_ALERT_DAYS = 30;
export const DEFAULT_EXAM_COMPANY = "VOLGA ENGENHARIA INDUSTRIA E COMERCIO LTDA";

export function emptyExamDraft(): ExamDraft {
  return {
    employeeName: "",
    company: DEFAULT_EXAM_COMPANY,
    examCategory: "Clínico",
    provider: "",
    serviceLocation: "",
    examName: "",
    specificType: "",
    performedOn: "",
    validityMonths: null,
    dueOn: null,
    dueDateOrigin: "nenhum",
    orderReference: "",
  };
}

function validParts(year: number, month: number, day: number): boolean {
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function parseExamDate(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  if (typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 120000) {
    const excelDate = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000);
    return parseExamDate(excelDate);
  }
  const text = String(value ?? "").trim();
  if (!text) return null;

  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (match) {
    const [, year, month, day] = match.map(Number);
    if (validParts(year, month, day))
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return null;
  }

  match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text);
  if (match) {
    const [, day, month, year] = match.map(Number);
    if (validParts(year, month, day))
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return null;
  }

  const digits = text.replace(/\D/g, "");
  if (/^\d{8}$/.test(digits)) {
    const parts =
      digits.startsWith("19") || digits.startsWith("20")
        ? [Number(digits.slice(0, 4)), Number(digits.slice(4, 6)), Number(digits.slice(6, 8))]
        : [Number(digits.slice(4, 8)), Number(digits.slice(2, 4)), Number(digits.slice(0, 2))];
    const [year, month, day] = parts;
    if (validParts(year, month, day))
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return null;
}

export function parseValidityMonths(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const rounded = Math.round(value);
    return rounded >= 1 && rounded <= 1200 ? rounded : null;
  }
  const text = String(value ?? "")
    .trim()
    .toLocaleLowerCase("pt-BR");
  if (!text) return null;
  const number = /\d+(?:[,.]\d+)?/.exec(text)?.[0]?.replace(",", ".");
  if (!number) return null;
  const amount = Number(number);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (/ano|year/.test(text)) {
    const months = Math.round(amount * 12);
    return months <= 1200 ? months : null;
  }
  const months = Math.round(amount);
  return months <= 1200 ? months : null;
}

export function addMonthsToIsoDate(dateIso: string, months: number): string | null {
  const parsed = parseExamDate(dateIso);
  if (!parsed || !Number.isInteger(months) || months < 1 || months > 1200) return null;
  const [year, month, day] = parsed.split("-").map(Number);
  const zeroMonth = month - 1 + months;
  const targetYear = year + Math.floor(zeroMonth / 12);
  const targetMonth = zeroMonth % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDay);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

export function dueDateFromPeriod(performedOn: string, months: number | null): string | null {
  return months ? addMonthsToIsoDate(performedOn, months) : null;
}

export function localTodayIso(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isoDayNumber(value: string): number | null {
  const parsed = parseExamDate(value);
  if (!parsed) return null;
  const [year, month, day] = parsed.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function daysUntilExamDue(dueOn: string | null, today = localTodayIso()): number | null {
  if (!dueOn) return null;
  const due = isoDayNumber(dueOn);
  const current = isoDayNumber(today);
  return due === null || current === null ? null : due - current;
}

export function examStatus(
  dueOn: string | null,
  today = localTodayIso(),
  alertDays = DEFAULT_EXAM_ALERT_DAYS,
): ExamStatus {
  const days = daysUntilExamDue(dueOn, today);
  if (days === null) return "sem_prazo";
  if (days < 0) return "vencido";
  if (days <= alertDays) return "atencao";
  return "em_dia";
}

export function validateExamDraft(draft: ExamDraft): string[] {
  const errors: string[] = [];
  if (!draft.employeeName.trim()) errors.push("Informe o nome do colaborador.");
  if (!draft.company.trim()) errors.push("Informe a empresa.");
  if (!draft.examName.trim()) errors.push("Informe o nome do exame.");
  if (!parseExamDate(draft.performedOn)) errors.push("Informe uma data de realização válida.");
  if (draft.dueOn && !parseExamDate(draft.dueOn))
    errors.push("Informe uma data de vencimento válida.");
  if (
    draft.validityMonths !== null &&
    (!Number.isInteger(draft.validityMonths) ||
      draft.validityMonths < 1 ||
      draft.validityMonths > 1200)
  ) {
    errors.push("O prazo deve estar entre 1 e 1.200 meses.");
  }
  return errors;
}

export function normalizeExamText(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

export async function examFingerprint(draft: ExamDraft): Promise<string> {
  const canonical = JSON.stringify([
    normalizeExamText(draft.company),
    normalizeExamText(draft.employeeName),
    draft.examCategory,
    normalizeExamText(draft.examName),
    normalizeExamText(draft.specificType),
    draft.performedOn,
    draft.dueOn ?? "",
    normalizeExamText(draft.provider),
    normalizeExamText(draft.serviceLocation),
    normalizeExamText(draft.orderReference),
    draft.sourceOccurrence ?? 0,
  ]);
  if (globalThis.crypto?.subtle) {
    const hash = await globalThis.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(canonical),
    );
    return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (const char of canonical) {
    first = Math.imul(first ^ char.charCodeAt(0), 0x01000193);
    second = Math.imul(second ^ char.charCodeAt(0), 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}
