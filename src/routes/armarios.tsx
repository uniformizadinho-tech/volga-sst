import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { saveAs } from "file-saver";
import {
  AlertTriangle,
  Cloud,
  DoorOpen,
  Download,
  History,
  LayoutGrid,
  List,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  Upload,
  UserCheck,
  UserMinus,
  Wand2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AuthDialog } from "@/components/auth/auth-dialog";
import { LockerGrid, LockerTable } from "@/components/armarios/locker-views";
import { AppFrame } from "@/components/layout/app-frame";
import { novoRascunho, mergeLocal, hoje, StatCard } from "@/components/armarios/armarios-helpers";
import { LockerHistoryDialog } from "@/components/armarios/locker-history-dialog";
import { LockerFormDialog, type LockerFormResult } from "@/components/armarios/locker-form-dialog";
import {
  ImportPreviewDialog,
  StandardizeDialog,
  type ImportReview,
} from "@/components/armarios/review-dialogs";
import { useAuth } from "@/hooks/use-auth";
import { can } from "@/lib/permissions";
import { recordOperation } from "@/lib/operation-audit";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  LOCKERS_IMPORT_ACCEPT,
  importReportCsv,
  lockersToCsv,
  parseLockersCsvFile,
} from "@/lib/lockers-io";
import {
  SITUACOES_PADRAO,
  computeStats,
  findInconsistencies,
  hasPendencia,
  isOcupado,
  matchesSearch,
  planImport,
  planStandardization,
  type Locker,
  type StandardizationPlan,
} from "@/lib/lockers-domain";
import {
  bulkUpsertLockersCloud,
  clearLockersCache,
  describeLockerError,
  loadLockersCache,
  loadLockersCloud,
  subscribeLockers,
  newLockerId,
  removeLockersCloud,
  saveLockersCache,
} from "@/lib/lockers-store";

export const Route = createFileRoute("/armarios")({
  head: () => ({
    meta: [
      { property: "og:title", content: "Gestão de armários — Volga SST" },
      {
        property: "og:description",
        content: "Controle de armários por vestiário, ocupante, setor e situação na Volga SST.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },

      { title: "Gestão de Armários — Volga" },
      {
        name: "description",
        content: "Controle de armários por vestiário: ocupante, setor e situação.",
      },
    ],
  }),
  component: ArmariosPage,
});

type StatusFilter = "todos" | "ocupado" | "livre" | "pendencia";
type ProblemaFilter =
  "nenhum" | "slotDuplicado" | "ocupanteDuplicado" | "semSetor" | "setorNome" | "foraPadrao";
const TODOS = "__todos__";
const LIMPAR_SITUACAO = "__limpar__";

function ArmariosPage() {
  const { user, role, loading: authLoading, signOut } = useAuth();
  const userId = user?.id ?? null;

  const [lockers, setLockers] = useState<Locker[]>([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [vestiarioFilter, setVestiarioFilter] = useState(TODOS);
  const [localFilter, setLocalFilter] = useState(TODOS);
  const [setorFilter, setSetorFilter] = useState(TODOS);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [problemaFilter, setProblemaFilter] = useState<ProblemaFilter>("nenhum");
  const [view, setView] = useState<"grid" | "list">("grid");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [formInitial, setFormInitial] = useState<Locker>(() => novoRascunho());
  const [saving, setSaving] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<Locker[] | null>(null);
  const [busy, setBusy] = useState(false);

  const [importReview, setImportReview] = useState<ImportReview | null>(null);
  const [importing, setImporting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [stdPlan, setStdPlan] = useState<StandardizationPlan | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const loadGeneration = useRef(0);

  // ---- carga ---------------------------------------------------------------
  // Antes: `user` era um objeto novo a cada render → o useCallback/useEffect
  // dependentes dele recarregavam a nuvem em loop infinito. Agora a carga
  // depende só do id do usuário.
  const refreshFromCloud = useCallback(async (opts?: { silent?: boolean }) => {
    const gen = ++loadGeneration.current;
    setCloudLoading(true);
    try {
      const cloud = await loadLockersCloud();
      if (gen !== loadGeneration.current) return;
      setLockers(cloud);
      setLoadError(null);
    } catch (err) {
      console.error(err);
      if (gen !== loadGeneration.current) return;
      const msg = describeLockerError(err, "Não foi possível carregar os armários da nuvem.");
      setLoadError(msg);
      if (!opts?.silent) toast.error(msg);
    } finally {
      if (gen === loadGeneration.current) setCloudLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!userId) {
      loadGeneration.current += 1;
      setLockers([]);
      setSelectedIds(new Set());
      setCloudLoading(false);
      return;
    }
    // cache só no cliente (evita divergência de hidratação do SSR) e só para pintar rápido
    const cache = loadLockersCache();
    if (cache.length) setLockers(cache);
    void refreshFromCloud({ silent: cache.length > 0 });
  }, [userId, authLoading, refreshFromCloud]);

  // Atualiza sozinho quando outra pessoa troca um armário, ao voltar para a aba e a cada 30s.
  useEffect(() => {
    if (authLoading || !userId) return;
    let timer: number | undefined;
    const pedir = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void refreshFromCloud({ silent: true }), 400);
    };
    let parar = () => {};
    try {
      parar = subscribeLockers(pedir);
    } catch (e) {
      console.error(e);
    }
    const onVis = () => {
      if (document.visibilityState === "visible") pedir();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", pedir);
    const intervalo = window.setInterval(pedir, 30000);
    return () => {
      parar();
      window.clearTimeout(timer);
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", pedir);
    };
  }, [userId, authLoading, refreshFromCloud]);

  useEffect(() => {
    if (userId && lockers.length) saveLockersCache(lockers);
  }, [lockers, userId]);

  // atalho "/" para buscar
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- derivados -----------------------------------------------------------
  const stats = useMemo(() => computeStats(lockers), [lockers]);
  const inc = useMemo(() => findInconsistencies(lockers), [lockers]);

  const problemaIds = useMemo(() => {
    const ids = (arr: Locker[]) => new Set(arr.map((l) => l.id));
    return {
      nenhum: null,
      slotDuplicado: ids(inc.slotsDuplicados.flat()),
      ocupanteDuplicado: ids(inc.ocupantesDuplicados.flat()),
      semSetor: ids(inc.semSetor),
      setorNome: ids(inc.setorIgualNome),
      foraPadrao: ids(inc.foraDoPadrao),
    } satisfies Record<ProblemaFilter, Set<string> | null>;
  }, [inc]);

  const flaggedIds = useMemo(
    () =>
      new Set([
        ...problemaIds.slotDuplicado,
        ...problemaIds.ocupanteDuplicado,
        ...problemaIds.setorNome,
      ]),
    [problemaIds],
  );

  const opcoes = useMemo(() => {
    const uniq = (v: string[]) =>
      Array.from(new Set(v.filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"));
    return {
      vestiarios: uniq(lockers.map((l) => l.vestiario)),
      locais: uniq(lockers.map((l) => l.localizacao)),
      setores: uniq(lockers.map((l) => l.setor)),
    };
  }, [lockers]);

  const filtered = useMemo(() => {
    const prob = problemaIds[problemaFilter];
    return lockers.filter((l) => {
      if (vestiarioFilter !== TODOS && l.vestiario !== vestiarioFilter) return false;
      if (localFilter !== TODOS && l.localizacao !== localFilter) return false;
      if (setorFilter !== TODOS && l.setor !== setorFilter) return false;
      if (statusFilter === "ocupado" && !isOcupado(l)) return false;
      if (statusFilter === "livre" && isOcupado(l)) return false;
      if (statusFilter === "pendencia" && !hasPendencia(l)) return false;
      if (prob && !prob.has(l.id)) return false;
      return matchesSearch(l, search);
    });
  }, [
    lockers,
    vestiarioFilter,
    localFilter,
    setorFilter,
    statusFilter,
    problemaFilter,
    problemaIds,
    search,
  ]);

  const filtrosAtivos =
    search.trim() !== "" ||
    vestiarioFilter !== TODOS ||
    localFilter !== TODOS ||
    setorFilter !== TODOS ||
    statusFilter !== "todos" ||
    problemaFilter !== "nenhum";

  const selecionados = useMemo(
    () => lockers.filter((l) => selectedIds.has(l.id)),
    [lockers, selectedIds],
  );

  // seleção nunca aponta para armários que não existem mais
  useEffect(() => {
    setSelectedIds((prev) => {
      if (!prev.size) return prev;
      const ids = new Set(lockers.map((l) => l.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [lockers]);

  function limparFiltros() {
    setSearch("");
    setVestiarioFilter(TODOS);
    setLocalFilter(TODOS);
    setSetorFilter(TODOS);
    setStatusFilter("todos");
    setProblemaFilter("nenhum");
  }

  // ---- gravação -------------------------------------------------------------
  async function gravar(changed: Locker[], msgOk: string, fallback: string): Promise<boolean> {
    try {
      await bulkUpsertLockersCloud(changed);
      setLockers((prev) => mergeLocal(prev, changed));
      void recordOperation({
        module: "ARMARIOS",
        action: "UPSERT",
        entityType: "locker",
        result: "success",
        description: `${changed.length} armário(s) atualizado(s).`,
        metadata: { quantidade: changed.length },
      });
      toast.success(msgOk);
      void refreshFromCloud({ silent: true });
      return true;
    } catch (err) {
      console.error(err);
      toast.error(describeLockerError(err, fallback));
      // a base pode ter mudado por outra pessoa — ressincroniza sem alarde
      void refreshFromCloud({ silent: true });
      return false;
    }
  }

  function openNew() {
    setFormInitial(
      novoRascunho({
        vestiario: vestiarioFilter !== TODOS ? vestiarioFilter : undefined,
        localizacao: localFilter !== TODOS ? localFilter : undefined,
      }),
    );
    setFormOpen(true);
  }

  function openEdit(l: Locker) {
    setFormInitial(l);
    setFormOpen(true);
  }

  async function handleFormSubmit({ locker, liberar }: LockerFormResult) {
    setSaving(true);
    const agora = Date.now();
    const liberados = liberar.map((l) => ({ ...l, ocupante: "", setor: "", updatedAt: agora }));
    const ok = await gravar(
      [...liberados, locker],
      liberados.length
        ? `Armário ${locker.numero} salvo — ${liberados.map((l) => l.numero).join(", ")} liberado(s)`
        : `Armário ${locker.numero} salvo`,
      "Erro ao salvar o armário.",
    );
    setSaving(false);
    if (ok) setFormOpen(false);
  }

  async function liberarArmarios(alvos: Locker[]) {
    const ocupados = alvos.filter(isOcupado);
    if (!ocupados.length) {
      toast.info("Os armários selecionados já estão livres.");
      return;
    }
    setBusy(true);
    const agora = Date.now();
    const ok = await gravar(
      ocupados.map((l) => ({ ...l, ocupante: "", setor: "", updatedAt: agora })),
      `${ocupados.length} armário(s) liberado(s)`,
      "Erro ao liberar armário(s).",
    );
    setBusy(false);
    if (ok) {
      setSelectedIds(new Set());
      toast("Ocupante removido", {
        description:
          ocupados.length === 1
            ? `${ocupados[0].ocupante} — armário ${ocupados[0].numero}`
            : undefined,
        action: {
          label: "Desfazer",
          onClick: () =>
            void gravar(
              ocupados.map((l) => ({ ...l, updatedAt: Date.now() })),
              "Liberação desfeita",
              "Não foi possível desfazer.",
            ),
        },
      });
    }
  }

  async function definirSituacao(valor: string) {
    if (!selecionados.length) return;
    const situacao = valor === LIMPAR_SITUACAO ? "" : valor;
    setBusy(true);
    const agora = Date.now();
    // correção: antes gravava `updated_at` (campo inexistente no tipo) e a data nunca mudava
    const ok = await gravar(
      selecionados.map((l) => ({ ...l, situacao, updatedAt: agora })),
      `${selecionados.length} armário(s) atualizado(s)`,
      "Erro ao atualizar os armários selecionados.",
    );
    setBusy(false);
    if (ok) setSelectedIds(new Set());
  }

  async function confirmDelete() {
    if (!deleteTargets?.length) return;
    setBusy(true);
    try {
      const ids = deleteTargets.map((l) => l.id);
      await removeLockersCloud(ids);
      setLockers((prev) => mergeLocal(prev, [], ids));
      toast.success(
        ids.length === 1
          ? `Armário ${deleteTargets[0].numero} excluído`
          : `${ids.length} armários excluídos`,
      );
      void recordOperation({
        module: "ARMARIOS",
        action: "DELETE",
        entityType: "locker",
        result: "success",
        description: `${ids.length} armário(s) excluído(s).`,
        metadata: { quantidade: ids.length },
      });
      setDeleteTargets(null);
    } catch (err) {
      console.error(err);
      toast.error(describeLockerError(err, "Erro ao excluir."));
      void refreshFromCloud({ silent: true });
    } finally {
      setBusy(false);
    }
  }

  // ---- importação / exportação ---------------------------------------------
  async function handleImportFile(file: File) {
    setImporting(true);
    try {
      const { lockers: parsed, warnings } = await parseLockersCsvFile(file);
      if (!parsed.length) {
        toast.error(warnings[0] ?? "Nenhum armário encontrado no arquivo.");
        return;
      }
      // compara com a base ATUAL da nuvem, não com o que está na tela
      const atual = await loadLockersCloud();
      setLockers(atual);
      setImportReview({ ...planImport(parsed, atual), fileName: file.name, warnings });
    } catch (err) {
      console.error(err);
      toast.error(
        describeLockerError(
          err,
          "Não foi possível ler o arquivo. Use CSV ou Excel com as colunas da planilha de controle.",
        ),
      );
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function confirmImport() {
    if (!importReview) return;
    const lista = [...importReview.novos, ...importReview.atualizados.map((a) => a.depois)];
    setImporting(true);
    try {
      await bulkUpsertLockersCloud(lista);
      toast.success(
        `Importação concluída: ${importReview.novos.length} novo(s), ${importReview.atualizados.length} atualizado(s), ${importReview.semAlteracao} sem alteração.`,
      );
      setImportReview(null);
      await refreshFromCloud();
    } catch (err) {
      console.error(err);
      toast.error(
        describeLockerError(
          err,
          "Erro ao gravar a importação. Nada foi perdido — revise e tente novamente.",
        ),
      );
      void refreshFromCloud({ silent: true });
    } finally {
      setImporting(false);
    }
  }

  function baixarRelatorio() {
    if (!importReview) return;
    saveAs(
      new Blob([importReportCsv(importReview, importReview.warnings)], {
        type: "text/csv;charset=utf-8",
      }),
      `relatorio-importacao-armarios-${hoje()}.csv`,
    );
  }

  function exportar() {
    const lista = filtered.length ? filtered : lockers;
    saveAs(
      new Blob([lockersToCsv(lista)], { type: "text/csv;charset=utf-8" }),
      `armarios-${hoje()}.csv`,
    );
    toast.success(`${lista.length} armário(s) exportado(s)`);
  }

  // ---- padronização ---------------------------------------------------------
  async function abrirPadronizacao() {
    setBusy(true);
    try {
      const atual = await loadLockersCloud();
      setLockers(atual);
      setStdPlan(planStandardization(atual));
    } catch (err) {
      toast.error(describeLockerError(err, "Não foi possível analisar a base."));
    } finally {
      setBusy(false);
    }
  }

  async function aplicarPadronizacao() {
    if (!stdPlan) return;
    setBusy(true);
    try {
      // remove as cópias vazias ANTES de regravar, senão a grafia padrão colidiria com elas
      await removeLockersCloud(stdPlan.remover.map((l) => l.id));
      await bulkUpsertLockersCloud(stdPlan.atualizar.map((a) => a.depois));
      toast.success(
        `Base padronizada: ${stdPlan.atualizar.length} corrigido(s), ${stdPlan.remover.length} cópia(s) vazia(s) removida(s).`,
      );
      setStdPlan(null);
      await refreshFromCloud();
    } catch (err) {
      console.error(err);
      toast.error(describeLockerError(err, "Erro ao padronizar a base."));
      void refreshFromCloud({ silent: true });
    } finally {
      setBusy(false);
    }
  }

  function selectVisibleBy(status: "livre" | "ocupado" | "pendencia") {
    const matches = filtered.filter((l) =>
      status === "livre" ? !isOcupado(l) : status === "ocupado" ? isOcupado(l) : hasPendencia(l),
    );
    toggleAll(
      matches.map((l) => l.id),
      true,
    );
    toast.info(
      `${matches.length} armário(s) ${status === "pendencia" ? "com pendência" : status === "livre" ? "livre(s)" : "ocupado(s)"} selecionado(s) entre os resultados visíveis.`,
    );
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(ids: string[], select: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (select) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  async function sair() {
    clearLockersCache();
    await signOut();
  }

  // ---- render ---------------------------------------------------------------
  const podeOperar = !!userId && isSupabaseConfigured && can(role, "armarios.write");
  const problemasChips: Array<{ key: ProblemaFilter; n: number; label: string }> = [
    {
      key: "slotDuplicado",
      n: inc.slotsDuplicados.length,
      label: "armário(s) cadastrado(s) em duplicidade",
    },
    {
      key: "ocupanteDuplicado",
      n: inc.ocupantesDuplicados.length,
      label: "colaborador(es) em mais de um armário",
    },
    { key: "setorNome", n: inc.setorIgualNome.length, label: "com o nome no lugar do setor" },
    { key: "semSetor", n: inc.semSetor.length, label: "ocupado(s) sem setor" },
    { key: "foraPadrao", n: inc.foraDoPadrao.length, label: "gravado(s) fora do padrão" },
  ];
  const problemasVisiveis = problemasChips.filter((c) => c.n > 0);
  const pendentes = lockers.filter(hasPendencia);
  const ocupacaoPorSetor = opcoes.setores
    .map((setor) => {
      const subset = lockers.filter((l) => l.setor === setor);
      return { setor, total: subset.length, ocupados: subset.filter(isOcupado).length };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  return (
    <AppFrame
      active="/armarios"
      userEmail={user?.email}
      search={
        <div className="sst-global-search">
          <Search size={18} aria-hidden="true" />
          <Input
            ref={searchRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Buscar armário, colaborador, setor ou local"
            placeholder="Buscar colaborador, armário, setor ou local..."
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} aria-label="Limpar busca">
              <X size={16} />
            </button>
          )}
        </div>
      }
    >
      <main className="sst-main">
        <div className="sst-page-heading">
          <div>
            <p className="sst-eyebrow">Operação / Armários</p>
            <h1>Gestão de Armários</h1>
            <p>Controle de ocupação, acesso e pendências dos armários dos colaboradores.</p>
          </div>
          <div className="sst-page-date">
            {new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date())}
          </div>
        </div>
        {!isSupabaseConfigured && (
          <Card className="mb-4 border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            A nuvem não está configurada neste ambiente — o módulo de armários é compartilhado com a
            equipe e precisa dela. Rode a migration <code>0002_lockers.sql</code> no Supabase.
          </Card>
        )}

        {authLoading ? (
          <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Verificando acesso…
          </div>
        ) : !user ? (
          <Card className="mx-auto mt-10 max-w-md p-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
              <Lock className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-semibold">Entre para acessar os armários</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              O controle de armários é compartilhado com a equipe e contém dados de colaboradores,
              por isso exige login.
            </p>
            <Button
              className="mt-5"
              onClick={() => setAuthDialogOpen(true)}
              disabled={!isSupabaseConfigured}
            >
              Entrar / criar conta
            </Button>
          </Card>
        ) : (
          <>
            {loadError && (
              <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> {loadError}
                  {lockers.length > 0 && " Exibindo a última cópia salva neste dispositivo."}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void refreshFromCloud()}
                  disabled={cloudLoading}
                >
                  <RefreshCw className={`mr-1.5 h-4 w-4 ${cloudLoading ? "animate-spin" : ""}`} />{" "}
                  Tentar novamente
                </Button>
              </Card>
            )}

            {/* Indicadores — clicáveis, funcionam como filtro rápido */}
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                icon={<LayoutGrid className="h-3.5 w-3.5" />}
                label="Total de armários"
                value={stats.total}
                hint={`${stats.livres} disponíveis · ${stats.ocupados} ocupados`}
                bar="bg-accent"
                active={statusFilter === "todos"}
                onClick={() => setStatusFilter("todos")}
              />
              <StatCard
                icon={<UserCheck className="h-3.5 w-3.5" />}
                label="Colaboradores com armário"
                value={stats.ocupados}
                hint={`${stats.ocupacaoPct}% de ocupação`}
                bar="bg-accent"
                active={statusFilter === "ocupado"}
                onClick={() => setStatusFilter(statusFilter === "ocupado" ? "todos" : "ocupado")}
              />
              <StatCard
                icon={<DoorOpen className="h-3.5 w-3.5" />}
                label="Armários disponíveis"
                value={stats.livres}
                hint="disponíveis para entrega"
                bar="bg-accent"
                active={statusFilter === "livre"}
                onClick={() => setStatusFilter(statusFilter === "livre" ? "todos" : "livre")}
              />
              <StatCard
                icon={<Tag className="h-3.5 w-3.5" />}
                label="Pendências registradas"
                value={stats.pendencias}
                hint="etiqueta, lacre, manutenção…"
                bar="bg-destructive"
                active={statusFilter === "pendencia"}
                onClick={() =>
                  setStatusFilter(statusFilter === "pendencia" ? "todos" : "pendencia")
                }
              />
            </div>

            {stats.total > 0 && (
              <div className="mb-4" aria-label={`Ocupação: ${stats.ocupacaoPct}%`}>
                <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="bg-accent transition-all"
                    style={{ width: `${(stats.ocupados / stats.total) * 100}%` }}
                  />
                  <div
                    className="bg-accent transition-all"
                    style={{ width: `${(stats.livres / stats.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Inconsistências */}
            {problemasVisiveis.length > 0 && (
              <Card className="mb-4 border-amber-500/40 bg-amber-500/5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <AlertTriangle className="h-4 w-4 text-amber-600" /> Inconsistências na base
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {problemasVisiveis.map((c) => (
                        <button
                          key={c.key}
                          type="button"
                          onClick={() =>
                            setProblemaFilter(problemaFilter === c.key ? "nenhum" : c.key)
                          }
                          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                            problemaFilter === c.key
                              ? "border-amber-600 bg-amber-500/20 font-medium"
                              : "border-amber-500/40 bg-background hover:bg-amber-500/10"
                          }`}
                        >
                          <strong>{c.n}</strong> {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {(inc.foraDoPadrao.length > 0 || inc.slotsDuplicados.length > 0) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void abrirPadronizacao()}
                      disabled={busy}
                    >
                      <Wand2 className="mr-1.5 h-4 w-4" /> Padronizar base
                    </Button>
                  )}
                </div>
              </Card>
            )}

            <div className="sst-dashboard-columns">
              <section
                className="sst-dashboard-primary"
                aria-label="Visualização e operação dos armários"
              >
                <div className="sst-section-heading">
                  <div>
                    <LayoutGrid size={18} />
                    <h2>Visualização dos armários</h2>
                  </div>
                  <span>
                    {filtered.length} de {lockers.length} exibidos
                  </span>
                </div>
                <div className="sst-location-tabs" role="group" aria-label="Filtrar por vestiário">
                  <button
                    type="button"
                    className={vestiarioFilter === TODOS ? "is-active" : ""}
                    aria-pressed={vestiarioFilter === TODOS}
                    onClick={() => setVestiarioFilter(TODOS)}
                  >
                    Todos
                  </button>
                  {opcoes.vestiarios.map((v) => (
                    <button
                      type="button"
                      key={v}
                      className={vestiarioFilter === v ? "is-active" : ""}
                      aria-pressed={vestiarioFilter === v}
                      onClick={() => setVestiarioFilter(v)}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                {/* Barra de ferramentas */}
                <Card className="mb-4 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={vestiarioFilter} onValueChange={setVestiarioFilter}>
                      <SelectTrigger className="w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={TODOS}>Todos vestiários</SelectItem>
                        {opcoes.vestiarios.map((v) => (
                          <SelectItem key={v} value={v}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={localFilter} onValueChange={setLocalFilter}>
                      <SelectTrigger className="w-[170px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={TODOS}>Todos os locais</SelectItem>
                        {opcoes.locais.map((v) => (
                          <SelectItem key={v} value={v}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={setorFilter} onValueChange={setSetorFilter}>
                      <SelectTrigger className="w-[170px]" aria-label="Filtrar por setor">
                        <SelectValue placeholder="Setor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={TODOS}>Todos os setores</SelectItem>
                        {opcoes.setores.map((v) => (
                          <SelectItem key={v} value={v}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={statusFilter}
                      onValueChange={(v) => setStatusFilter(v as StatusFilter)}
                    >
                      <SelectTrigger className="w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todas situações</SelectItem>
                        <SelectItem value="ocupado">Ocupados</SelectItem>
                        <SelectItem value="livre">Livres</SelectItem>
                        <SelectItem value="pendencia">Com pendência</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex rounded-md border border-border">
                      <Button
                        variant={view === "grid" ? "secondary" : "ghost"}
                        size="icon"
                        className="h-9 w-9 rounded-r-none"
                        onClick={() => setView("grid")}
                        aria-label="Visualizar em grade"
                        title="Grade"
                      >
                        <LayoutGrid className="h-4 w-4" />
                      </Button>
                      <Button
                        variant={view === "list" ? "secondary" : "ghost"}
                        size="icon"
                        className="h-9 w-9 rounded-l-none"
                        onClick={() => setView("list")}
                        aria-label="Visualizar em lista"
                        title="Lista"
                      >
                        <List className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      Mostrando <strong className="text-foreground">{filtered.length}</strong> de{" "}
                      {lockers.length} armários
                      {filtrosAtivos && (
                        <button
                          type="button"
                          className="ml-2 underline hover:text-foreground"
                          onClick={limparFiltros}
                        >
                          limpar filtros
                        </button>
                      )}
                      {filtered.length > 0 && (
                        <button
                          type="button"
                          className="ml-2 underline hover:text-foreground"
                          onClick={() =>
                            toggleAll(
                              filtered.map((l) => l.id),
                              true,
                            )
                          }
                        >
                          selecionar todos
                        </button>
                      )}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => selectVisibleBy("livre")}
                        disabled={!filtered.length}
                      >
                        Selecionar livres
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => selectVisibleBy("ocupado")}
                        disabled={!filtered.length}
                      >
                        Selecionar ocupados
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => selectVisibleBy("pendencia")}
                        disabled={!filtered.length}
                      >
                        Selecionar pendências
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedIds(new Set())}
                        disabled={!selectedIds.size}
                      >
                        Limpar seleção
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void refreshFromCloud()}
                        disabled={cloudLoading}
                        title="Recarregar da nuvem"
                      >
                        <RefreshCw className={`h-4 w-4 ${cloudLoading ? "animate-spin" : ""}`} />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
                        <History className="mr-1.5 h-4 w-4" /> Histórico
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={exportar}
                        disabled={!lockers.length}
                      >
                        <Download className="mr-1.5 h-4 w-4" /> Exportar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={importing || !podeOperar}
                      >
                        {importing ? (
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="mr-1.5 h-4 w-4" />
                        )}
                        Importar planilha
                      </Button>
                      <Button size="sm" onClick={openNew} disabled={!podeOperar}>
                        <Plus className="mr-1.5 h-4 w-4" /> Novo armário
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept={LOCKERS_IMPORT_ACCEPT}
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleImportFile(f);
                        }}
                      />
                    </div>
                  </div>
                </Card>

                {/* Ações em lote */}
                {selecionados.length > 0 && (
                  <Card className="sticky top-[80px] z-40 mb-4 flex flex-wrap items-center justify-between gap-2 border-primary/40 bg-background/95 p-3 backdrop-blur">
                    <span className="text-sm">
                      <strong>{selecionados.length}</strong> selecionado(s)
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value=""
                        onValueChange={(v) => void definirSituacao(v)}
                        disabled={busy}
                      >
                        <SelectTrigger className="h-9 w-[190px]">
                          <SelectValue placeholder="Definir situação…" />
                        </SelectTrigger>
                        <SelectContent>
                          {SITUACOES_PADRAO.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s.charAt(0) + s.slice(1).toLowerCase()}
                            </SelectItem>
                          ))}
                          <SelectItem value={LIMPAR_SITUACAO}>Sem pendência</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void liberarArmarios(selecionados)}
                        disabled={busy}
                      >
                        <UserMinus className="mr-1.5 h-4 w-4" /> Liberar
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setDeleteTargets(selecionados)}
                        disabled={busy}
                      >
                        <Trash2 className="mr-1.5 h-4 w-4" /> Excluir
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                        Limpar seleção
                      </Button>
                    </div>
                  </Card>
                )}

                {/* Conteúdo */}
                <Card className="overflow-hidden">
                  {cloudLoading && lockers.length === 0 ? (
                    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Carregando armários…
                    </div>
                  ) : lockers.length === 0 ? (
                    <div className="px-6 py-16 text-center">
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                        <DoorOpen className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <p className="font-medium">Nenhum armário cadastrado</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Importe a planilha de controle (CSV ou Excel) ou cadastre o primeiro
                        armário.
                      </p>
                      <div className="mt-4 flex justify-center gap-2">
                        <Button
                          variant="outline"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={!podeOperar}
                        >
                          <Upload className="mr-1.5 h-4 w-4" /> Importar planilha
                        </Button>
                        <Button onClick={openNew} disabled={!podeOperar}>
                          <Plus className="mr-1.5 h-4 w-4" /> Novo armário
                        </Button>
                      </div>
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="px-6 py-16 text-center">
                      <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                      <p className="font-medium">Nenhum armário com esses filtros</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {search
                          ? `Nada encontrado para “${search}”.`
                          : "Ajuste ou limpe os filtros para ver os armários."}
                      </p>
                      <Button className="mt-4" variant="outline" onClick={limparFiltros}>
                        Limpar filtros
                      </Button>
                    </div>
                  ) : view === "grid" ? (
                    <LockerGrid
                      lockers={filtered}
                      selectedIds={selectedIds}
                      onToggleSelect={toggleSelected}
                      onToggleAll={toggleAll}
                      onEdit={openEdit}
                      onRelease={(l) => void liberarArmarios([l])}
                      onDelete={(l) => setDeleteTargets([l])}
                      flaggedIds={flaggedIds}
                    />
                  ) : (
                    <LockerTable
                      lockers={filtered}
                      selectedIds={selectedIds}
                      onToggleSelect={toggleSelected}
                      onToggleAll={toggleAll}
                      onEdit={openEdit}
                      onRelease={(l) => void liberarArmarios([l])}
                      onDelete={(l) => setDeleteTargets([l])}
                      flaggedIds={flaggedIds}
                    />
                  )}
                </Card>
              </section>
              <aside className="sst-dashboard-aside" aria-label="Resumo e ações">
                <Card className="sst-side-card">
                  <h2>
                    <Plus size={18} /> Ações rápidas
                  </h2>
                  <button type="button" onClick={openNew} disabled={!podeOperar}>
                    <Plus size={17} /> Novo armário <span>›</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter("livre");
                      setView("grid");
                    }}
                  >
                    <DoorOpen size={17} /> Ver disponíveis <span>›</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter("pendencia");
                      setView("grid");
                    }}
                  >
                    <AlertTriangle size={17} /> Ver pendências <span>›</span>
                  </button>
                  <button type="button" onClick={exportar} disabled={!lockers.length}>
                    <Download size={17} /> Exportar armários (CSV) <span>›</span>
                  </button>
                </Card>
                <Card className="sst-side-card">
                  <h2>
                    <Tag size={18} /> Armários com pendência
                  </h2>
                  {pendentes.length ? (
                    pendentes.slice(0, 5).map((l) => (
                      <button
                        type="button"
                        className="sst-pending-item"
                        key={l.id}
                        onClick={() => openEdit(l)}
                      >
                        <span>
                          <strong>Armário {l.numero}</strong>
                          <small>
                            {l.ocupante || "Sem ocupante"} · {l.vestiario}
                          </small>
                        </span>
                        <span className="sst-pending-label">{l.situacao}</span>
                      </button>
                    ))
                  ) : (
                    <p className="sst-side-empty">Nenhuma pendência registrada.</p>
                  )}
                  {pendentes.length > 5 && (
                    <button
                      type="button"
                      className="sst-see-all"
                      onClick={() => setStatusFilter("pendencia")}
                    >
                      Ver todas ({pendentes.length})
                    </button>
                  )}
                </Card>
                <Card className="sst-side-card">
                  <h2>
                    <LayoutGrid size={18} /> Ocupação por setor
                  </h2>
                  <div className="sst-occupancy">
                    <strong>{stats.ocupacaoPct}%</strong>
                    <span>
                      {stats.ocupados} de {stats.total} ocupados
                    </span>
                    <div className="sst-meter">
                      <span style={{ width: `${stats.ocupacaoPct}%` }} />
                    </div>
                  </div>
                  {ocupacaoPorSetor.length ? (
                    ocupacaoPorSetor.map(({ setor, total, ocupados }) => (
                      <button
                        type="button"
                        className="sst-sector-row"
                        key={setor}
                        onClick={() => setSetorFilter(setor)}
                      >
                        <span title={setor}>{setor}</span>
                        <strong>
                          {ocupados}/{total}
                        </strong>
                      </button>
                    ))
                  ) : (
                    <p className="sst-side-empty">
                      Os setores aparecem quando houver armários cadastrados.
                    </p>
                  )}
                </Card>
              </aside>
            </div>
          </>
        )}
      </main>

      <LockerHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />

      <LockerFormDialog
        open={formOpen}
        onOpenChange={(o) => !saving && setFormOpen(o)}
        initial={formInitial}
        lockers={lockers}
        saving={saving}
        onSubmit={(r) => void handleFormSubmit(r)}
      />

      <ImportPreviewDialog
        review={importReview}
        confirming={importing}
        onCancel={() => setImportReview(null)}
        onConfirm={() => void confirmImport()}
        onDownloadReport={baixarRelatorio}
      />

      <StandardizeDialog
        plan={stdPlan}
        confirming={busy}
        onCancel={() => setStdPlan(null)}
        onConfirm={() => void aplicarPadronizacao()}
      />

      <Dialog
        open={deleteTargets !== null}
        onOpenChange={(o) => !o && !busy && setDeleteTargets(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {deleteTargets?.length === 1
                ? `Excluir armário ${deleteTargets[0].numero}?`
                : `Excluir ${deleteTargets?.length ?? 0} armários?`}
            </DialogTitle>
            <DialogDescription>
              O cadastro do armário sai da base da equipe. Para apenas desocupar, use{" "}
              <strong>Liberar</strong>.
            </DialogDescription>
          </DialogHeader>
          {deleteTargets && deleteTargets.some(isOcupado) && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              Atenção: {deleteTargets.filter(isOcupado).length} armário(s) ainda têm ocupante.
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTargets(null)} disabled={busy}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => void confirmDelete()} disabled={busy}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />
    </AppFrame>
  );
}
