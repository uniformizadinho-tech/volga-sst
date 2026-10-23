import { supabase } from "@/lib/supabase";
import { csvRow } from "@/lib/csv-safe";
import {
  DEFAULT_EXAM_ALERT_DAYS,
  examFingerprint,
  localTodayIso,
  type ExamDraft,
  type ExamRecord,
  type ExamStatus,
  type ExamSummary,
} from "./exames";

const TABLE = "exames_ocupacionais";
const SELECT_FIELDS =
  "id,employee_name,company,exam_category,provider,service_location,exam_name,specific_type,performed_on,validity_months,due_on,due_date_origin,order_reference,fingerprint,revision,archived_at,created_at,updated_at";

export type ExamStatusFilter = "todos" | ExamStatus | "arquivados";

export interface ExamListOptions {
  page: number;
  pageSize: number;
  search: string;
  status: ExamStatusFilter;
  today?: string;
  alertDays?: number;
}

export interface ExamListResult {
  records: ExamRecord[];
  total: number;
}

function mapRecord(row: Record<string, unknown>): ExamRecord {
  return {
    id: String(row.id),
    employeeName: String(row.employee_name ?? ""),
    company: String(row.company ?? ""),
    examCategory:
      row.exam_category === "Clínico" || row.exam_category === "Complementar"
        ? row.exam_category
        : "Outro",
    provider: String(row.provider ?? ""),
    serviceLocation: String(row.service_location ?? ""),
    examName: String(row.exam_name ?? ""),
    specificType: String(row.specific_type ?? ""),
    performedOn: String(row.performed_on ?? ""),
    validityMonths: row.validity_months === null ? null : Number(row.validity_months),
    dueOn: row.due_on ? String(row.due_on) : null,
    dueDateOrigin:
      row.due_date_origin === "importado" ||
      row.due_date_origin === "calculado" ||
      row.due_date_origin === "manual"
        ? row.due_date_origin
        : "nenhum",
    orderReference: String(row.order_reference ?? ""),
    fingerprint: String(row.fingerprint ?? ""),
    revision: Number(row.revision ?? 1),
    archivedAt: row.archived_at ? String(row.archived_at) : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function payload(draft: ExamDraft, fingerprint: string) {
  return {
    employee_name: draft.employeeName.trim(),
    company: draft.company.trim(),
    exam_category: draft.examCategory,
    provider: draft.provider.trim() || null,
    service_location: draft.serviceLocation.trim() || null,
    exam_name: draft.examName.trim(),
    specific_type: draft.specificType.trim() || null,
    performed_on: draft.performedOn || null,
    validity_months: draft.validityMonths,
    due_on: draft.dueOn,
    due_date_origin: draft.dueDateOrigin,
    order_reference: draft.orderReference.trim() || null,
    fingerprint,
  };
}

function tableMissingMessage(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /exames_ocupacionais/i.test(error.message ?? "")
  );
}

function filteredQuery(options: ExamListOptions) {
  const today = options.today ?? localTodayIso();
  const horizon = new Date(`${today}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + (options.alertDays ?? DEFAULT_EXAM_ALERT_DAYS));
  const lastAlertDay = horizon.toISOString().slice(0, 10);
  let query = supabase.from(TABLE).select(SELECT_FIELDS, { count: "exact" });

  if (options.status === "arquivados") query = query.not("archived_at", "is", null);
  else query = query.is("archived_at", null);

  if (options.status === "vencido") query = query.lt("due_on", today);
  if (options.status === "atencao") query = query.gte("due_on", today).lte("due_on", lastAlertDay);
  if (options.status === "em_dia") query = query.gt("due_on", lastAlertDay);
  if (options.status === "sem_prazo") query = query.is("due_on", null);

  const term = options.search
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ");
  if (term) {
    const pattern = `%${term}%`;
    query = query.or(
      `employee_name.ilike.${pattern},company.ilike.${pattern},exam_name.ilike.${pattern},specific_type.ilike.${pattern},provider.ilike.${pattern}`,
    );
  }

  return query
    .order("due_on", { ascending: true, nullsFirst: false })
    .order("employee_name", { ascending: true })
    .range(options.page * options.pageSize, options.page * options.pageSize + options.pageSize - 1);
}

export async function loadExamPage(options: ExamListOptions): Promise<ExamListResult> {
  const { data, error, count } = await filteredQuery(options);
  if (error) {
    if (tableMissingMessage(error)) {
      throw new Error(
        "O banco ainda não tem a tabela de exames. Aplique a migração SQL incluída no projeto e tente novamente.",
      );
    }
    throw new Error(
      "Não foi possível carregar a lista de exames. Confira sua conexão e permissão.",
    );
  }
  return {
    records: (data ?? []).map((row) => mapRecord(row as Record<string, unknown>)),
    total: count ?? 0,
  };
}

export async function loadExamSummary(
  today = localTodayIso(),
  alertDays = DEFAULT_EXAM_ALERT_DAYS,
): Promise<ExamSummary> {
  const lastAlertDate = new Date(`${today}T00:00:00Z`);
  lastAlertDate.setUTCDate(lastAlertDate.getUTCDate() + alertDays);
  const lastAlertDay = lastAlertDate.toISOString().slice(0, 10);
  const count = async (query: ReturnType<typeof baseCountQuery>) => {
    const { count: amount, error } = await query;
    if (error) {
      if (tableMissingMessage(error))
        throw new Error(
          "A tabela de exames ainda precisa ser criada pela migração SQL do projeto.",
        );
      throw new Error("Não foi possível calcular os indicadores dos exames.");
    }
    return amount ?? 0;
  };
  const [total, expired, dueSoon, noDueDate] = await Promise.all([
    count(baseCountQuery()),
    count(baseCountQuery().lt("due_on", today)),
    count(baseCountQuery().gte("due_on", today).lte("due_on", lastAlertDay)),
    count(baseCountQuery().is("due_on", null)),
  ]);
  return { total, expired, dueSoon, noDueDate };
}

function baseCountQuery() {
  return supabase.from(TABLE).select("id", { count: "exact", head: true }).is("archived_at", null);
}

export async function saveExamRecord(
  draft: ExamDraft,
  userId: string,
  existing?: ExamRecord,
): Promise<ExamRecord> {
  const fingerprint = await examFingerprint(draft);
  const row = payload(draft, fingerprint);
  if (existing) {
    const { data, error } = await supabase
      .from(TABLE)
      .update({ ...row, updated_by: userId })
      .eq("id", existing.id)
      .eq("revision", existing.revision)
      .select(SELECT_FIELDS)
      .maybeSingle();
    if (error) {
      if (error.code === "23505")
        throw new Error("Já existe um registro igual. Confira a lista antes de salvar.");
      throw new Error("Não foi possível atualizar o exame. Confira sua conexão e permissão.");
    }
    if (!data)
      throw new Error("Outra pessoa alterou este registro. Atualize a lista e tente novamente.");
    return mapRecord(data as Record<string, unknown>);
  }
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...row, created_by: userId, updated_by: userId, record_origin: "manual" })
    .select(SELECT_FIELDS)
    .single();
  if (error) {
    if (error.code === "23505")
      throw new Error("Este exame já está cadastrado para a mesma pessoa e data.");
    throw new Error("Não foi possível cadastrar o exame. Confira sua conexão e permissão.");
  }
  return mapRecord(data as Record<string, unknown>);
}

export async function setExamArchived(
  record: ExamRecord,
  archived: boolean,
  userId: string,
): Promise<ExamRecord> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ archived_at: archived ? new Date().toISOString() : null, updated_by: userId })
    .eq("id", record.id)
    .eq("revision", record.revision)
    .select(SELECT_FIELDS)
    .maybeSingle();
  if (error)
    throw new Error("Não foi possível arquivar o registro. Confira sua conexão e permissão.");
  if (!data)
    throw new Error("Outra pessoa alterou este registro. Atualize a lista e tente novamente.");
  return mapRecord(data as Record<string, unknown>);
}

export interface ImportExamResult {
  inserted: number;
  skippedAsDuplicates: number;
}

export async function importExamRecords(
  records: ExamDraft[],
  userId: string,
  onProgress?: (processed: number, total: number) => void,
): Promise<ImportExamResult> {
  const batchSize = 250;
  let inserted = 0;
  for (let offset = 0; offset < records.length; offset += batchSize) {
    const batch = records.slice(offset, offset + batchSize);
    const rows = await Promise.all(
      batch.map(async (draft) => ({
        ...payload(draft, await examFingerprint(draft)),
        created_by: userId,
        updated_by: userId,
        record_origin: "importado",
      })),
    );
    const { data, error } = await supabase
      .from(TABLE)
      .upsert(rows, { onConflict: "fingerprint", ignoreDuplicates: true })
      .select("id");
    if (error) {
      const location = inserted ? `A operação parou após ${inserted} novos registros; ` : "";
      if (tableMissingMessage(error)) {
        throw new Error(`${location}aplique a migração da tabela de exames e reenvie o arquivo.`);
      }
      throw new Error(
        `${location}não foi possível gravar o lote seguinte. O reenvio ignora duplicados automaticamente.`,
      );
    }
    inserted += data?.length ?? 0;
    onProgress?.(Math.min(offset + batch.length, records.length), records.length);
  }
  return { inserted, skippedAsDuplicates: records.length - inserted };
}

export function examsToCsv(records: ExamRecord[]): string {
  const header = [
    "Empresa",
    "Funcionário",
    "Tipo",
    "Fornecedor",
    "Local/Unidade de Atendimento",
    "Exame",
    "Tipo Específico",
    "Data",
    "Prazo Próximo",
    "Data Próximo",
    "Ordem",
    "Status",
  ];
  const rows = records.map((record) => [
    record.company,
    record.employeeName,
    record.examCategory,
    record.provider,
    record.serviceLocation,
    record.examName,
    record.specificType,
    record.performedOn,
    record.validityMonths ? `${record.validityMonths} meses` : "",
    record.dueOn ?? "",
    record.orderReference,
    record.dueOn ? "Com vencimento" : "Sem prazo definido",
  ]);
  return "\uFEFF" + [csvRow(header), ...rows.map((row) => csvRow(row))].join("\r\n");
}
