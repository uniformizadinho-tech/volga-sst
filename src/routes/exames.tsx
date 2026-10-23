import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Download,
  HelpCircle,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Stethoscope,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { AppFrame } from "@/components/layout/app-frame";
import { ExamFormDialog } from "@/components/exames/exam-form-dialog";
import { ExamImportDialog } from "@/components/exames/exam-import-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { can, explainDenied } from "@/lib/permissions";
import {
  DEFAULT_EXAM_ALERT_DAYS,
  daysUntilExamDue,
  emptyExamDraft,
  examStatus,
  type ExamDraft,
  type ExamRecord,
  type ExamStatus,
} from "@/lib/exames";
import {
  EXAMS_IMPORT_ACCEPT,
  parseExamImportFile,
  type ExamImportPreview,
} from "@/lib/exames-import";
import {
  examsToCsv,
  importExamRecords,
  loadExamPage,
  loadExamSummary,
  setExamArchived,
  saveExamRecord,
  type ExamStatusFilter,
} from "@/lib/exames-store";
import { recordOperation } from "@/lib/operation-audit";

const PAGE_SIZE = 50;
const STATUS_LABEL: Record<ExamStatus, string> = {
  vencido: "Vencido",
  atencao: "Vence em breve",
  em_dia: "Em dia",
  sem_prazo: "Sem prazo",
};
const STATUS_STYLE: Record<ExamStatus, string> = {
  vencido: "border-destructive/30 bg-destructive/10 text-destructive",
  atencao: "border-warning/30 bg-warning-soft text-warning",
  em_dia: "border-success/30 bg-surface-soft text-success",
  sem_prazo: "border-border bg-muted text-muted-foreground",
};

export const Route = createFileRoute("/exames")({
  head: () => ({
    meta: [
      { title: "Exames ocupacionais — Volga SST" },
      { property: "og:title", content: "Exames ocupacionais — Volga SST" },
      {
        property: "og:description",
        content: "Acompanhe exames realizados e próximos vencimentos na Volga SST.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "description",
        content: "Controle restrito de exames ocupacionais realizados e próximos vencimentos.",
      },
    ],
  }),
  component: ExamesPage,
});

function formatDate(value: string | null): string {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : "—";
}

function dueDescription(record: ExamRecord): string {
  const days = daysUntilExamDue(record.dueOn);
  if (days === null) return "Prazo não informado";
  if (days < 0) return `Vencido há ${Math.abs(days)} dia${Math.abs(days) === 1 ? "" : "s"}`;
  if (days === 0) return "Vence hoje";
  return `Em ${days} dia${days === 1 ? "" : "s"}`;
}

function ExamStatusBadge({ record }: { record: ExamRecord }) {
  const status = examStatus(record.dueOn);
  const Icon =
    status === "vencido"
      ? AlertTriangle
      : status === "atencao"
        ? Clock3
        : status === "em_dia"
          ? CheckCircle2
          : HelpCircle;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium ${STATUS_STYLE[status]}`}
    >
      <Icon size={13} aria-hidden="true" /> {STATUS_LABEL[status]}
    </span>
  );
}

function ExamesPage() {
  const { role, user } = useAuth();
  const canRead = can(role, "exames.read");
  const canWrite = can(role, "exames.write");
  const [records, setRecords] = useState<ExamRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({ total: 0, expired: 0, dueSoon: 0, noDueDate: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [status, setStatus] = useState<ExamStatusFilter>("todos");
  const [page, setPage] = useState(0);
  const requestId = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formSaving, setFormSaving] = useState(false);
  const [formInitial, setFormInitial] = useState<ExamDraft | null>(null);
  const [editing, setEditing] = useState<ExamRecord | null>(null);
  const [importPreview, setImportPreview] = useState<ExamImportPreview | null>(null);
  const [importFileName, setImportFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ processed: 0, total: 0 });
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearchQuery(search);
      setPage(0);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const refresh = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const options = { page, pageSize: PAGE_SIZE, search: searchQuery, status };
      const [list, counts] = await Promise.all([loadExamPage(options), loadExamSummary()]);
      if (requestId.current !== currentRequest) return;
      setRecords(list.records);
      setTotal(list.total);
      setSummary(counts);
    } catch (cause) {
      if (requestId.current !== currentRequest) return;
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os exames.");
      setRecords([]);
      setTotal(0);
    } finally {
      if (requestId.current === currentRequest) setLoading(false);
    }
  }, [canRead, page, searchQuery, status]);

  useEffect(() => {
    void refresh();
    return () => {
      requestId.current += 1;
    };
  }, [refresh]);

  const changeFilter = (next: ExamStatusFilter) => {
    setStatus(next);
    setPage(0);
  };

  const openNew = () => {
    setEditing(null);
    setFormInitial(emptyExamDraft());
    setFormOpen(true);
  };

  const openEdit = (record: ExamRecord) => {
    setEditing(record);
    setFormInitial({
      employeeName: record.employeeName,
      company: record.company,
      examCategory: record.examCategory,
      provider: record.provider,
      serviceLocation: record.serviceLocation,
      examName: record.examName,
      specificType: record.specificType,
      performedOn: record.performedOn,
      validityMonths: record.validityMonths,
      dueOn: record.dueOn,
      dueDateOrigin: record.dueDateOrigin,
      orderReference: record.orderReference,
    });
    setFormOpen(true);
  };

  const save = async (draft: ExamDraft) => {
    if (!user || !canWrite) return;
    setFormSaving(true);
    try {
      const saved = await saveExamRecord(draft, user.id, editing ?? undefined);
      await recordOperation({
        module: "EXAMES",
        action: editing ? "EXAME_ATUALIZADO" : "EXAME_CADASTRADO",
        entityType: "exame_ocupacional",
        entityId: saved.id,
        result: "success",
        description: editing
          ? "Cadastro administrativo de exame atualizado."
          : "Cadastro administrativo de exame criado.",
      });
      toast.success(editing ? "Exame atualizado." : "Exame registrado.");
      setFormOpen(false);
      await refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Não foi possível salvar o exame.");
    } finally {
      setFormSaving(false);
    }
  };

  const archive = async (record: ExamRecord, archived: boolean) => {
    if (!user || !canWrite) return;
    try {
      await setExamArchived(record, archived, user.id);
      await recordOperation({
        module: "EXAMES",
        action: archived ? "EXAME_ARQUIVADO" : "EXAME_RESTAURADO",
        entityType: "exame_ocupacional",
        entityId: record.id,
        result: "success",
        description: archived ? "Registro de exame arquivado." : "Registro de exame restaurado.",
      });
      toast.success(
        archived ? "Registro arquivado; o histórico foi preservado." : "Registro restaurado.",
      );
      await refresh();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Não foi possível atualizar o registro.",
      );
    }
  };

  const chooseImportFile = async (file?: File) => {
    if (!file) return;
    try {
      const preview = await parseExamImportFile(file);
      setImportFileName(file.name);
      setImportPreview(preview);
      setImportProgress({ processed: 0, total: preview.records.length });
      if (!preview.records.length) toast.error("Nenhum registro válido foi encontrado no arquivo.");
    } catch {
      toast.error(
        "Não foi possível ler o arquivo. Use CSV ou Excel com cabeçalho e colunas da lista de exames.",
      );
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const confirmImport = async () => {
    if (!user || !canWrite || !importPreview?.records.length) return;
    setImporting(true);
    setImportProgress({ processed: 0, total: importPreview.records.length });
    try {
      const result = await importExamRecords(importPreview.records, user.id, (processed, count) => {
        setImportProgress({ processed, total: count });
      });
      await recordOperation({
        module: "EXAMES",
        action: "EXAMES_IMPORTADOS",
        entityType: "lote_exames",
        result: "success",
        description: "Importação de registros administrativos de exames concluída.",
        metadata: { inseridos: result.inserted, duplicados_ignorados: result.skippedAsDuplicates },
      });
      toast.success(
        `${result.inserted.toLocaleString("pt-BR")} novos registros importados; ${result.skippedAsDuplicates.toLocaleString("pt-BR")} duplicados ignorados.`,
      );
      setImportPreview(null);
      setImportFileName("");
      setPage(0);
      await refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "A importação não foi concluída.");
    } finally {
      setImporting(false);
    }
  };

  const exportAll = async () => {
    if (!canRead || !total) return;
    setExporting(true);
    try {
      const pageSize = 500;
      const countPages = Math.ceil(total / pageSize);
      const all: ExamRecord[] = [];
      for (let currentPage = 0; currentPage < countPages; currentPage += 1) {
        const result = await loadExamPage({
          page: currentPage,
          pageSize,
          search: searchQuery,
          status,
        });
        all.push(...result.records);
      }
      const blob = new Blob([examsToCsv(all)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `exames-ocupacionais-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Não foi possível exportar os exames.");
    } finally {
      setExporting(false);
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canGoBack = page > 0;
  const canGoForward = page + 1 < pages;

  if (!canRead) {
    return (
      <AppFrame active="/exames">
        <main className="sst-main sst-tool-main">
          <Card className="mx-auto mt-12 max-w-xl p-8 text-center">
            <ShieldAlert className="mx-auto h-8 w-8 text-warning" />
            <h1 className="mt-4 text-xl font-semibold">Acesso restrito</h1>
            <p className="mt-2 text-sm text-muted-foreground">{explainDenied("exames.read")}</p>
          </Card>
        </main>
      </AppFrame>
    );
  }

  return (
    <AppFrame
      active="/exames"
      search={
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar exames"
            className="pl-9"
            placeholder="Buscar colaborador, empresa ou exame"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      }
    >
      <main className="sst-main sst-tool-main space-y-5">
        <div className="sst-module-heading">
          <div>
            <p className="sst-eyebrow">PESSOAS E SAÚDE</p>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <Stethoscope className="h-6 w-6 text-accent" /> Exames ocupacionais
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Registros realizados, prestadores e próximos vencimentos por colaborador.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void refresh()}
              disabled={loading}
            >
              <RefreshCw className={loading ? "animate-spin" : ""} size={16} /> Atualizar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void exportAll()}
              disabled={exporting || !total}
            >
              {exporting ? (
                <LoaderCircle className="animate-spin" size={16} />
              ) : (
                <Download size={16} />
              )}
              {exporting ? "Preparando…" : "Exportar lista"}
            </Button>
            {canWrite && (
              <>
                <input
                  ref={fileInput}
                  className="sr-only"
                  type="file"
                  accept={EXAMS_IMPORT_ACCEPT}
                  aria-label="Selecionar arquivo de exames para importar"
                  onChange={(event) => void chooseImportFile(event.target.files?.[0])}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInput.current?.click()}
                  disabled={importing}
                >
                  <Upload size={16} /> Importar CSV/Excel
                </Button>
                <Button type="button" onClick={openNew}>
                  <Plus size={16} /> Registrar exame
                </Button>
              </>
            )}
          </div>
        </div>

        <div
          className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft/50 p-3 text-xs text-muted-foreground"
          role="note"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p>
            <strong className="text-foreground">
              Dados pessoais de saúde — acesso restrito a RH, SESMT e administração.
            </strong>{" "}
            Este módulo guarda apenas dados administrativos e prazos. Não registre laudos,
            diagnósticos ou resultados clínicos. A lista em PDF deve ser convertida em CSV/Excel; a
            importação mostra uma prévia e só grava após confirmação.
          </p>
        </div>

        {error && (
          <div
            className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
            role="alert"
          >
            {error}
          </div>
        )}

        <section
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          aria-label="Resumo dos exames"
        >
          <button type="button" className="text-left" onClick={() => changeFilter("todos")}>
            <Card
              className={`h-full p-4 transition-colors ${status === "todos" ? "border-primary/50 bg-primary/[0.03]" : "hover:border-primary/30"}`}
            >
              <span className="text-xs text-muted-foreground">Registros ativos</span>
              <strong className="mt-1 block text-2xl">
                {summary.total.toLocaleString("pt-BR")}
              </strong>
            </Card>
          </button>
          <button type="button" className="text-left" onClick={() => changeFilter("vencido")}>
            <Card
              className={`h-full p-4 transition-colors ${status === "vencido" ? "border-destructive/50 bg-destructive/[0.03]" : "hover:border-destructive/30"}`}
            >
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <AlertTriangle size={13} /> Vencidos
              </span>
              <strong className="mt-1 block text-2xl text-destructive">
                {summary.expired.toLocaleString("pt-BR")}
              </strong>
            </Card>
          </button>
          <button type="button" className="text-left" onClick={() => changeFilter("atencao")}>
            <Card
              className={`h-full p-4 transition-colors ${status === "atencao" ? "border-amber-500/50 bg-amber-500/[0.03]" : "hover:border-amber-500/30"}`}
            >
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock3 size={13} /> Vencem em até {DEFAULT_EXAM_ALERT_DAYS} dias
              </span>
              <strong className="mt-1 block text-2xl text-amber-700 dark:text-amber-300">
                {summary.dueSoon.toLocaleString("pt-BR")}
              </strong>
            </Card>
          </button>
          <button
            type="button"
            className={`text-left ${status === "sem_prazo" ? "" : ""}`}
            onClick={() => changeFilter("sem_prazo")}
          >
            <Card
              className={`h-full p-4 transition-colors ${status === "sem_prazo" ? "border-border bg-muted/60" : "hover:border-primary/30"}`}
            >
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <CalendarClock size={13} /> Sem vencimento cadastrado
              </span>
              <strong className="mt-1 block text-2xl">
                {summary.noDueDate.toLocaleString("pt-BR")}
              </strong>
            </Card>
          </button>
        </section>

        <section className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold">Lista de exames</h2>
              <p className="text-xs text-muted-foreground">
                {total.toLocaleString("pt-BR")} registro(s) nesta busca · alerta de vencimento
                configurado para {DEFAULT_EXAM_ALERT_DAYS} dias
              </p>
            </div>
            <Select
              value={status}
              onValueChange={(value) => changeFilter(value as ExamStatusFilter)}
            >
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue placeholder="Filtrar situação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os ativos</SelectItem>
                <SelectItem value="vencido">Vencidos</SelectItem>
                <SelectItem value="atencao">Vencem em breve</SelectItem>
                <SelectItem value="em_dia">Em dia</SelectItem>
                <SelectItem value="sem_prazo">Sem prazo</SelectItem>
                <SelectItem value="arquivados">Arquivados</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Colaborador / empresa</th>
                    <th className="px-4 py-3">Exame</th>
                    <th className="px-4 py-3">Realizado</th>
                    <th className="px-4 py-3">Próximo vencimento</th>
                    <th className="px-4 py-3">Situação</th>
                    <th className="px-4 py-3">Prestador</th>
                    <th className="px-4 py-3">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                        <LoaderCircle className="mx-auto mb-2 animate-spin" />
                        Carregando exames…
                      </td>
                    </tr>
                  ) : records.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                        {error
                          ? "Corrija a conexão ou aplique a migração para carregar os dados."
                          : "Nenhum exame corresponde aos filtros."}
                      </td>
                    </tr>
                  ) : (
                    records.map((record) => {
                      const isArchived = Boolean(record.archivedAt);
                      return (
                        <tr key={record.id} className="align-top hover:bg-muted/30">
                          <td className="px-4 py-3">
                            <strong
                              className="block max-w-[250px] truncate"
                              title={record.employeeName}
                            >
                              {record.employeeName}
                            </strong>
                            <span
                              className="block max-w-[250px] truncate text-xs text-muted-foreground"
                              title={record.company}
                            >
                              {record.company}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="block max-w-[250px] font-medium">
                              {record.examName}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {record.specificType || record.examCategory}
                              {record.serviceLocation ? ` · ${record.serviceLocation}` : ""}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {formatDate(record.performedOn)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span className="block font-medium">{formatDate(record.dueOn)}</span>
                            <span className="text-xs text-muted-foreground">
                              {dueDescription(record)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {isArchived ? (
                              <span className="rounded-full border px-2 py-1 text-xs text-muted-foreground">
                                Arquivado
                              </span>
                            ) : (
                              <ExamStatusBadge record={record} />
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="block max-w-[180px] truncate" title={record.provider}>
                              {record.provider || "—"}
                            </span>
                            {record.orderReference && (
                              <span className="text-xs text-muted-foreground">
                                {record.orderReference}
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            {canWrite && (
                              <div className="flex justify-end gap-1">
                                {!isArchived && (
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    title="Editar exame"
                                    aria-label={`Editar exame de ${record.employeeName}`}
                                    onClick={() => openEdit(record)}
                                  >
                                    <span className="sr-only">Editar</span>
                                    <CalendarClock size={16} />
                                  </Button>
                                )}
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  title={isArchived ? "Restaurar registro" : "Arquivar registro"}
                                  aria-label={`${isArchived ? "Restaurar" : "Arquivar"} registro de ${record.employeeName}`}
                                  onClick={() => void archive(record, !isArchived)}
                                >
                                  {isArchived ? (
                                    <ArchiveRestore size={16} />
                                  ) : (
                                    <Archive size={16} />
                                  )}
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground sm:flex-row">
              <span>
                {total
                  ? `Exibindo ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} de ${total.toLocaleString("pt-BR")}`
                  : "Nenhum registro"}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((value) => Math.max(0, value - 1))}
                  disabled={!canGoBack || loading}
                >
                  Anterior
                </Button>
                <span className="flex items-center px-1">
                  Página {page + 1} de {pages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((value) => value + 1)}
                  disabled={!canGoForward || loading}
                >
                  Próxima
                </Button>
              </div>
            </div>
          </Card>
        </section>
      </main>
      <ExamFormDialog
        open={formOpen}
        initial={formInitial}
        editing={editing}
        saving={formSaving}
        onOpenChange={setFormOpen}
        onSave={save}
      />
      <ExamImportDialog
        preview={importPreview}
        fileName={importFileName}
        importing={importing}
        progress={importProgress}
        onOpenChange={(open) => {
          if (!open && !importing) {
            setImportPreview(null);
            setImportFileName("");
          }
        }}
        onConfirm={confirmImport}
      />
    </AppFrame>
  );
}
