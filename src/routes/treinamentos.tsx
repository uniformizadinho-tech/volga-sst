import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardList,
  Download,
  RefreshCw,
  Search,
  Upload,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Users,
  Link2,
  Clock3,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AppFrame } from "@/components/layout/app-frame";
import { TrainingTabs } from "@/components/treinamentos/training-tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { can, explainDenied } from "@/lib/permissions";
import { normalizedName } from "@/lib/collaborator-preparation";
import {
  TRAINING_LABELS,
  TRAINING_NRS,
  emptyTrainingState,
  filterTrainingRecords,
  grupoTreinamentoVinculado,
  latestTrainingRecords,
  linkTrainingOrigins,
  mergeTrainingRecords,
  requerAcaoTreinamento,
  readTrainingFile,
  resumirMatrizTreinamentos,
  trainingCsv,
  trainingPeople,
  trainingRecordMatches,
  type TrainingRecord,
  type TrainingStatus,
} from "@/lib/training-matrix";
import {
  clearTrainingState,
  loadTrainingState,
  saveTrainingState,
  type TrainingSnapshot,
} from "@/lib/training-store";

export const Route = createFileRoute("/treinamentos")({
  head: () => ({
    meta: [
      { title: "Matriz de treinamentos — Volga SST" },
      {
        name: "description",
        content:
          "Treinamentos NR-01, NR-06, NR-12 e NR-18 da Matriz, com conferência de importações e pendências por colaborador.",
      },
      { property: "og:title", content: "Matriz de treinamentos — Volga SST" },
      {
        property: "og:description",
        content: "Registros e pendências de treinamento da Matriz com dados originais preservados.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TrainingPage,
});

function Status({ record }: { record: TrainingRecord }) {
  const tone = {
    nao_possui: "border-destructive/25 bg-destructive/5 text-destructive",
    declarado: "border-warning/30 bg-warning/10 text-warning",
    comprovante: "border-warning/30 bg-warning/10 text-warning",
    revisar: "border-border bg-muted/60 text-muted-foreground",
  }[record.status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium ${tone}`}
    >
      {record.status === "declarado" ? (
        <Clock3 className="h-3 w-3 shrink-0" />
      ) : (
        <AlertTriangle className="h-3 w-3 shrink-0" />
      )}
      {TRAINING_LABELS[record.status]}
    </span>
  );
}

function nextStep(status: TrainingStatus): string {
  return {
    declarado: "Solicitar comprovante ou confirmar a evidência.",
    nao_possui: "Programar o treinamento necessário.",
    comprovante: "Localizar o certificado na origem documental.",
    revisar: "Conferir a linha original e decidir a tratativa.",
  }[status];
}
function download(records: TrainingRecord[]) {
  const url = URL.createObjectURL(
    new Blob([trainingCsv(records)], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "treinamentos-matriz.csv";
  a.click();
  URL.revokeObjectURL(url);
}
type Person = ReturnType<typeof trainingPeople>[number];

function TrainingPage() {
  const { user, role } = useAuth();
  const [snapshot, setSnapshot] = useState<TrainingSnapshot>({
    state: emptyTrainingState(),
    revision: null,
  });
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [search, setSearch] = useState(""),
    [department, setDepartment] = useState("all"),
    [job, setJob] = useState("all");
  const [nr, setNr] = useState("all"),
    [status, setStatus] = useState("all");
  const [page, setPage] = useState(0),
    [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<TrainingRecord[] | null>(null),
    [previewPage, setPreviewPage] = useState(0);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null),
    [linkSelection, setLinkSelection] = useState<Set<string>>(new Set());
  const fileInput = useRef<HTMLInputElement>(null);
  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setSnapshot(await loadTrainingState());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    setPage(0);
    setSelected(new Set());
  }, [search, department, job, nr, status]);
  const people = useMemo(() => trainingPeople(snapshot.state), [snapshot.state]);
  const currentRecords = useMemo(
    () => latestTrainingRecords(snapshot.state.records),
    [snapshot.state.records],
  );
  const departments = [...new Set(people.map((p) => p.department).filter(Boolean))].sort();
  const jobs = [...new Set(people.map((p) => p.job).filter(Boolean))].sort();
  const filtered = people.filter(
    (p) =>
      (!search || normalizedName(p.name).includes(normalizedName(search))) &&
      (department === "all" || p.department === department) &&
      (job === "all" || p.job === job) &&
      p.records.some((record) => trainingRecordMatches(record, nr, status)),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 40));
  const visible = filtered.slice(
    Math.min(page, pages - 1) * 40,
    (Math.min(page, pages - 1) + 1) * 40,
  );
  const detail = people.find((p) => p.id === detailId);
  const candidates = detail
    ? currentRecords.filter((r) => normalizedName(r.name) === normalizedName(detail.name))
    : [];
  const existingIds = new Set(snapshot.state.records.map((r) => r.id));
  const previewNew = preview?.filter((r) => !existingIds.has(r.id)) ?? [];
  const previewDuplicates = (preview?.length ?? 0) - previewNew.length;
  const approved = previewNew.filter((r) => !excluded.has(r.id));
  const summary = resumirMatrizTreinamentos(snapshot.state);
  const pending = summary.emAberto;
  const visibleIds = useMemo(() => new Set(people.map((person) => person.id)), [people]);
  const selectedVisible = useMemo(
    () => new Set([...selected].filter((id) => visibleIds.has(id))),
    [selected, visibleIds],
  );
  const hasActiveFilters = Boolean(
    search.trim() || department !== "all" || job !== "all" || nr !== "all" || status !== "all",
  );
  const namesCount = new Map<string, number>();
  people.forEach((p) =>
    namesCount.set(normalizedName(p.name), (namesCount.get(normalizedName(p.name)) ?? 0) + 1),
  );
  function toggle(id: string, setter: (value: Set<string>) => void, state: Set<string>) {
    const next = new Set(state);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }
  function clearFilters() {
    setSearch("");
    setDepartment("all");
    setJob("all");
    setNr("all");
    setStatus("all");
  }
  async function openFile(file?: File) {
    if (!file || loading || error) return;
    if (!user) {
      toast.error(
        "Entre na plataforma para importar a Matriz e compartilhar os registros com a equipe.",
      );
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    if (!can(role, "treinamentos.write")) {
      toast.error(explainDenied("treinamentos.write"));
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    setBusy(true);
    try {
      setPreview(await readTrainingFile(file, user.id));
      setExcluded(new Set());
      setPreviewPage(0);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Não foi possível ler a planilha.");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  async function importRecords() {
    if (!approved.length) return;
    setBusy(true);
    try {
      setSnapshot(
        await saveTrainingState(mergeTrainingRecords(snapshot.state, approved), snapshot.revision),
      );
      setPreview(null);
      toast.success(`${approved.length} registros importados. Dados originais preservados.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  async function confirmLinks() {
    if (!detail || linkSelection.size < 2 || !user) return;
    if (!can(role, "treinamentos.write")) {
      toast.error(explainDenied("treinamentos.write"));
      return;
    }
    setBusy(true);
    try {
      // Include the complete existing group, so confirming an additional row never splits a previously confirmed person.
      const origins = new Set(linkSelection);
      candidates
        .filter((r) => linkSelection.has(r.origin))
        .forEach((r) => {
          const group = grupoTreinamentoVinculado(snapshot.state, r);
          if (group)
            Object.entries(snapshot.state.links).forEach(([origin, id]) => {
              if (id === group) origins.add(origin);
            });
        });
      const group = `person:${crypto.randomUUID()}`;
      setSnapshot(
        await saveTrainingState(
          linkTrainingOrigins(snapshot.state, [...origins], group),
          snapshot.revision,
        ),
      );
      setDetailId(group);
      setLinkSelection(new Set());
      toast.success("Vínculo confirmado.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Não foi possível confirmar.");
    } finally {
      setBusy(false);
    }
  }
  async function clearAll() {
    if (!user || !can(role, "treinamentos.write")) {
      toast.error(explainDenied("treinamentos.write"));
      return;
    }
    const total = snapshot.state.records.length;
    if (
      !window.confirm(
        `Apagar definitivamente os ${total} registros importados da Matriz? ` +
          "Isso remove os dados de todos os usuários e não pode ser desfeito.",
      )
    )
      return;
    setBusy(true);
    try {
      await clearTrainingState();
      setSnapshot({ state: emptyTrainingState(), revision: null });
      setSelected(new Set());
      setDetailId(null);
      toast.success("Registros importados apagados.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Não foi possível apagar.");
    } finally {
      setBusy(false);
    }
  }
  function exportFiltered(onlyPending = false) {
    const rows = filtered
      .filter((p) => !selectedVisible.size || selectedVisible.has(p.id))
      .flatMap((p) =>
        onlyPending
          ? filterTrainingRecords(p.records, nr, "pending")
          : filterTrainingRecords(p.records, nr, status),
      );
    download(rows);
  }
  return (
    <AppFrame
      active="/treinamentos"
      userEmail={user?.email}
      search={
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Buscar colaborador"
            placeholder="Buscar colaborador"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      }
    >
      <TrainingTabs current="registro" />
      <main className="sst-main sst-training space-y-5">
        <header className="sst-module-heading">
          <div className="max-w-2xl">
            <p className="sst-eyebrow">Pessoas e saúde · Matriz documental</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-[1.7rem]">
              Treinamentos
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Acompanhe as declarações e evidências importadas. A Matriz não substitui certificados
              emitidos nem define prazos de validade.
            </p>
            <p className="mt-3 text-xs text-muted-foreground" role="status">
              {snapshot.revision
                ? `Última sincronização: ${new Date(snapshot.revision).toLocaleString("pt-BR")}`
                : "Nenhuma Matriz compartilhada foi importada ainda"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="icon"
              title="Recarregar"
              aria-label="Recarregar"
              disabled={loading || busy}
              onClick={() => void refresh()}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              disabled={busy || loading || !!error || !can(role, "treinamentos.write")}
              title={
                can(role, "treinamentos.write")
                  ? "Importar planilha Excel da Matriz"
                  : "Seu perfil não pode importar a Matriz"
              }
              onClick={() => fileInput.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              {busy ? "Aguarde…" : "Importar planilha"}
            </Button>
            {snapshot.state.records.length > 0 && can(role, "treinamentos.write") && (
              <Button
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={busy || loading}
                title="Apagar todos os registros importados da Matriz"
                onClick={() => void clearAll()}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Apagar registros
              </Button>
            )}
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => void openFile(e.target.files?.[0])}
            />
          </div>
        </header>
        {error && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          >
            <span>{error}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void refresh()}
              disabled={loading || busy}
            >
              Tentar novamente
            </Button>
          </div>
        )}
        <section className="grid grid-cols-2 border-y border-border" aria-label="Resumo da Matriz">
          <div className="group border-r border-border/80 px-3 py-3 first:border-l md:px-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Pessoas
            </p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{people.length}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Grupos provisórios ou confirmados
            </p>
          </div>
          <div className="group border-r border-border/80 px-3 py-3 md:px-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Registros
            </p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{currentRecords.length}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Registros atuais por origem
            </p>
          </div>
          <button
            type="button"
            className="group border-r border-warning/30 bg-warning/[0.07] px-3 py-3 text-left transition-colors hover:bg-warning/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:px-4"
            aria-label={`Filtrar ${pending} itens em aberto`}
            onClick={() => setStatus("pending")}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-warning">
              Ação necessária
            </p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-warning">{pending}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Itens em aberto na Matriz
            </p>
          </button>
          <div className="group px-3 py-3 md:px-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Identidade
            </p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{summary.nomesParaConferir}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Nomes repetidos para conferir
            </p>
          </div>
        </section>
        <section
          className="flex flex-wrap items-center gap-2 border-b border-border/70 px-0 py-2"
          aria-label="Distribuição dos status documentais"
        >
          <span className="mr-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Situações atuais
          </span>
          {(Object.entries(TRAINING_LABELS) as Array<[TrainingStatus, string]>).map(
            ([key, label]) => (
              <span
                key={key}
                className="border-l border-border px-2.5 py-1 text-xs text-muted-foreground first:border-l-0"
              >
                <strong className="mr-1 text-foreground">{summary.porStatus[key]}</strong>
                {label}
              </span>
            ),
          )}
        </section>
        <section
          className="border-b border-border/80 bg-transparent pb-3 pt-1"
          aria-label="Filtros da Matriz"
        >
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <Filter
                label="Setor"
                value={department}
                onChange={setDepartment}
                options={departments.map((v) => [v, v])}
              />
              <Filter
                label="Função"
                value={job}
                onChange={setJob}
                options={jobs.map((v) => [v, v])}
              />
              <Filter
                label="Norma"
                value={nr}
                onChange={setNr}
                options={TRAINING_NRS.map((n) => [n, `NR-${n}`])}
              />
              <Filter
                label="Situação"
                value={status}
                onChange={setStatus}
                options={[["pending", "Todos em aberto"], ...Object.entries(TRAINING_LABELS)]}
              />
            </div>
            <div className="flex shrink-0 flex-wrap gap-2 border-t border-border/70 pt-3 xl:border-l xl:border-t-0 xl:pl-3 xl:pt-0">
              <Button
                variant="outline"
                disabled={!filtered.length}
                onClick={() => exportFiltered()}
              >
                <Download className="mr-2 h-4 w-4" />
                {selectedVisible.size
                  ? `Exportar seleção (${selectedVisible.size})`
                  : "Exportar filtrados"}
              </Button>
              <Button
                variant="outline"
                disabled={!filtered.length}
                onClick={() => exportFiltered(true)}
              >
                Exportar itens em aberto
              </Button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3 text-xs text-muted-foreground">
            <span>{filtered.length} pessoa(s) correspondem aos filtros atuais</span>
            <div className="flex flex-wrap items-center gap-3">
              <span>
                {selectedVisible.size
                  ? `${selectedVisible.size} selecionada(s) para exportação`
                  : "Selecione pessoas para exportar um recorte"}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!hasActiveFilters}
                onClick={clearFilters}
              >
                Limpar filtros
              </Button>
            </div>
          </div>
        </section>
        {loading ? (
          <p role="status" className="py-16 text-center text-muted-foreground">
            Carregando treinamentos…
          </p>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/25 bg-destructive/5 px-6 py-12 text-center">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-destructive" />
            <h2 className="text-lg font-medium">A Matriz está indisponível</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Os indicadores acima não representam dados carregados. Tente novamente para consultar
              a versão compartilhada.
            </p>
          </div>
        ) : !people.length && !error ? (
          <div className="py-16 text-center">
            <Users className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
            <h2 className="text-lg font-medium">Nenhuma planilha importada</h2>
            <Button
              className="mt-5"
              disabled={!can(role, "treinamentos.write")}
              onClick={() => fileInput.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              Importar planilha
            </Button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto border-y border-border/80 bg-card">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        aria-label="Selecionar página"
                        checked={!!visible.length && visible.every((p) => selected.has(p.id))}
                        onCheckedChange={(checked) => {
                          const next = new Set(selected);
                          visible.forEach((p) => (checked ? next.add(p.id) : next.delete(p.id)));
                          setSelected(next);
                        }}
                      />
                    </TableHead>
                    <TableHead>Colaborador / Setor</TableHead>
                    <TableHead>Função</TableHead>
                    {TRAINING_NRS.map((n) => (
                      <TableHead key={n}>NR-{n}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(p.id)}
                          aria-label={`Selecionar ${p.name}`}
                          onCheckedChange={() => toggle(p.id, setSelected, selected)}
                        />
                      </TableCell>
                      <TableCell className="min-w-60">
                        <Button
                          variant="link"
                          className="h-auto max-w-80 justify-start whitespace-normal p-0 text-left text-foreground"
                          onClick={() => {
                            setDetailId(p.id);
                            setLinkSelection(new Set(p.records.map((r) => r.origin)));
                          }}
                        >
                          {p.name}
                        </Button>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {p.department || "Setor não informado"}
                        </p>
                        {(namesCount.get(normalizedName(p.name)) ?? 0) > 1 && (
                          <p className="text-xs text-muted-foreground">Vínculo a conferir</p>
                        )}
                      </TableCell>
                      <TableCell className="min-w-40 max-w-52 whitespace-normal text-xs">
                        {p.job || "—"}
                      </TableCell>
                      {TRAINING_NRS.map((n) => (
                        <TableCell key={n} className="min-w-40 whitespace-normal">
                          {p.records.filter(
                            (r) => r.nr === n && trainingRecordMatches(r, nr, status),
                          ).length ? (
                            p.records
                              .filter((r) => r.nr === n && trainingRecordMatches(r, nr, status))
                              .map((r) => (
                                <button
                                  key={r.id}
                                  type="button"
                                  className="my-1 block w-full rounded-lg p-1 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  aria-label={`Abrir detalhes de NR-${r.nr} para ${p.name}`}
                                  onClick={() => {
                                    setDetailId(p.id);
                                    setLinkSelection(
                                      new Set(p.records.map((record) => record.origin)),
                                    );
                                  }}
                                >
                                  <Status record={r} />
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {r.dates.join(" · ") || "Data não informada"}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    Validade não definida
                                  </p>
                                </button>
                              ))
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Sem registro no filtro atual
                            </span>
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {!visible.length && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                        Nenhum resultado para os filtros.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <Pager
              page={Math.min(page, pages - 1)}
              pages={pages}
              total={filtered.length}
              change={setPage}
            />
          </>
        )}
      </main>
      <Dialog
        open={!!preview}
        onOpenChange={(open) => {
          if (!open && !busy) setPreview(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Conferência da importação · Matriz</DialogTitle>
            <DialogDescription>
              {preview?.[0]?.file} · {preview?.length} registros ·{" "}
              {preview?.filter((r) => r.hidden).length} linhas ocultas incluídas
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-5 border-y py-3 text-sm">
            <span>{previewNew.length} novos registros</span>
            <span>{previewDuplicates} já importados</span>
            <span>
              {previewNew.filter((r) => requerAcaoTreinamento(r.status)).length} itens em aberto
            </span>
            <span>{approved.length} selecionados</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Sem CPF ou matrícula: nomes iguais ficam separados até a confirmação do vínculo.
            Declarações não comprovam certificados.
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
            {TRAINING_NRS.map((n) => (
              <span key={n}>
                NR-{n}: {preview?.filter((r) => r.nr === n).length ?? 0}
              </span>
            ))}
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Checkbox
                      aria-label="Incluir todos os novos registros"
                      checked={!!previewNew.length && !excluded.size}
                      onCheckedChange={(checked) =>
                        setExcluded(checked ? new Set() : new Set(previewNew.map((r) => r.id)))
                      }
                    />
                  </TableHead>
                  <TableHead>Nome / origem</TableHead>
                  <TableHead>NR</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Observações originais</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview?.slice(previewPage * 30, (previewPage + 1) * 30).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Checkbox
                        aria-label={`Incluir linha ${r.row} de ${r.sheet}`}
                        disabled={existingIds.has(r.id)}
                        checked={!existingIds.has(r.id) && !excluded.has(r.id)}
                        onCheckedChange={() => toggle(r.id, setExcluded, excluded)}
                      />
                    </TableCell>
                    <TableCell className="min-w-52 whitespace-normal">
                      {r.name}
                      <p className="text-xs text-muted-foreground">
                        {r.sheet} · linha {r.row}
                        {r.hidden ? " · oculta" : ""}
                        {existingIds.has(r.id) ? " · já importado" : ""}
                      </p>
                    </TableCell>
                    <TableCell>{r.nr}</TableCell>
                    <TableCell className="min-w-40">
                      <Status record={r} />
                    </TableCell>
                    <TableCell className="max-w-80 whitespace-normal text-xs">
                      {r.notes || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pager
            page={previewPage}
            pages={Math.max(1, Math.ceil((preview?.length ?? 0) / 30))}
            total={preview?.length ?? 0}
            change={setPreviewPage}
          />
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setPreview(null)}>
              Cancelar
            </Button>
            <Button disabled={!approved.length || busy} onClick={() => void importRecords()}>
              {busy ? "Salvando…" : `Confirmar ${approved.length} registros`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!detail}
        onOpenChange={(open) => {
          if (!open && !busy) setDetailId(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detail?.name}</DialogTitle>
            <DialogDescription>
              Matriz · {detail?.department || "Setor não informado"} ·{" "}
              {detail?.job || "Função não informada"}
            </DialogDescription>
          </DialogHeader>
          {detail?.records.map((r) => (
            <section key={r.id} className="space-y-2 border-t pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium">NR-{r.nr}</h3>
                <Status record={r} />
              </div>
              <p className="text-sm">{r.declaration}</p>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {r.notes || "Sem observações"}
              </p>
              <p className="text-xs text-muted-foreground">
                Validade não definida · Certificado não anexado
              </p>
              <p className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Próximo passo:</span>{" "}
                {nextStep(r.status)}
              </p>
              <details className="text-sm">
                <summary className="cursor-pointer">Dados originais e histórico</summary>
                {snapshot.state.records
                  .filter((old) => `${old.sheet}:${old.row}` === `${r.sheet}:${r.row}`)
                  .map((old) => (
                    <div key={old.id} className="mt-3 border-l-2 pl-3">
                      <p className="text-xs text-muted-foreground">
                        {old.file} · {old.sheet} · linha {old.row} · importado em{" "}
                        {new Date(old.importedAt).toLocaleString("pt-BR")}
                      </p>
                      <dl className="mt-2 space-y-1">
                        {Object.entries(old.raw).map(([key, value]) => (
                          <div key={key} className="grid grid-cols-2 gap-3 break-words text-xs">
                            <dt className="text-muted-foreground">{key}</dt>
                            <dd>{value || "—"}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}
              </details>
            </section>
          ))}
          {candidates.length > (detail?.records.length ?? 0) && (
            <section className="space-y-3 border-t pt-4">
              <h3 className="font-medium">Possíveis correspondências pelo nome</h3>
              <p className="text-sm text-muted-foreground">
                Confirme somente os registros que pertencem à mesma pessoa. A sugestão pelo nome não
                é uma identificação.
              </p>
              {candidates.map((r) => (
                <label key={r.origin} className="flex items-start gap-3 text-sm">
                  <Checkbox
                    checked={linkSelection.has(r.origin)}
                    onCheckedChange={() => toggle(r.origin, setLinkSelection, linkSelection)}
                  />
                  <span>
                    {r.sheet} · linha {r.row}
                    <small className="block text-muted-foreground">
                      {r.department || "Setor não informado"} · {r.job || "Função não informada"}
                    </small>
                  </span>
                </label>
              ))}
              <Button
                disabled={busy || linkSelection.size < 2 || !can(role, "treinamentos.write")}
                title={
                  can(role, "treinamentos.write")
                    ? "Confirmar que os registros pertencem à mesma pessoa"
                    : "Seu perfil não pode confirmar vínculos"
                }
                onClick={() => void confirmLinks()}
              >
                <Link2 className="mr-2 h-4 w-4" />
                Confirmar mesma pessoa ({linkSelection.size})
              </Button>
            </section>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailId(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppFrame>
  );
}
function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[][];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{label}: todos</SelectItem>
        {options.map(([key, text]) => (
          <SelectItem key={key} value={key}>
            {text}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function Pager({
  page,
  pages,
  total,
  change,
}: {
  page: number;
  pages: number;
  total: number;
  change: (p: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>
        {total} resultados · página {page + 1} de {pages}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Página anterior"
          disabled={page === 0}
          onClick={() => change(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Próxima página"
          disabled={page >= pages - 1}
          onClick={() => change(page + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
