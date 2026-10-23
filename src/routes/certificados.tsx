import { createFileRoute, Link } from "@tanstack/react-router";
import { AppFrame } from "@/components/layout/app-frame";
import {
  Field,
  IconBtn,
  ColRow,
  CollapsibleCard,
  CertificatePreview,
} from "@/components/certificados/certificate-ui";
import { useInstructors } from "@/hooks/use-instructors";
import { useTemplateManagement } from "@/hooks/use-template-management";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { confirmar } from "@/components/ui-patterns/confirm-dialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Download,
  Loader2,
  FileText,
  User,
  BookmarkPlus,
  Save,
  Trash2,
  Layers,
  Plus,
  Copy,
  ArrowUp,
  ArrowDown,
  ClipboardPaste,
  Upload,
  FileDown,
  FileUp,
  Pencil,
  History as HistoryIcon,
  CalendarIcon,
  AlertCircle,
  RotateCcw,
  Cloud,
  CloudOff,
  LogOut,
  ChevronDown,
  ListChecks,
  Search,
  CheckSquare,
  Square,
  ArrowUpDown,
  Wand2,
  FileSignature,
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  AlertTriangle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  ChartCard,
  ChartRow,
  KpiCard,
  KpiGrid,
  RankList,
  TrendBars,
  lastMonths,
} from "@/components/module/module-kit";
import {
  DEFAULT_COLABORADORES,
  DEFAULT_CONTEUDO_PROGRAMATICO,
  DEFAULT_SHARED,
  normalizeShared,
  suggestValidadeMeses,
  type Colaborador,
  type SharedFields,
} from "@/lib/certificate-template";
import {
  ANUENCIA_NR_LABELS,
  anuenciaFromColaboradores,
  CHUNK_SIZE,
  GenerationAbortedError,
  MAX_COLABORADORES,
  regrasDeOuroFromColaboradores,
  type AnuenciaNr,
} from "@/lib/certificados-dados";

// Geradores de PowerPoint/PDF são pesados: só são baixados quando alguém gera um documento.
const carregarGeradorPptx = () => import("@/lib/generate-pptx");
const carregarGeradorAnuencia = () => import("@/lib/generate-anuencia");
const carregarGeradorRegrasDeOuro = () => import("@/lib/generate-regras-de-ouro");

import { Checkbox } from "@/components/ui/checkbox";
import {
  loadTemplates,
  newId,
  removeTemplate,
  saveTemplates,
  upsertTemplate,
  duplicateTemplate,
  renameTemplate,
  exportTemplates,
  importTemplates,
  loadTemplatesCloud,
  syncTemplatesToCloud,
  mergeLocalTemplatesIntoCloud,
  isBuiltInTemplateId,
  type SavedTemplate,
} from "@/lib/templates-store";
import { isBuiltInInstructorId } from "@/lib/instructors-store";

import { useAuth } from "@/hooks/use-auth";
import { can, explainDenied } from "@/lib/permissions";
import { AuthDialog } from "@/components/auth/auth-dialog";
import { isValidCPF, maskCPF } from "@/lib/cpf";
import {
  duplicateIndices,
  normalizedName,
  prepareCollaborators,
} from "@/lib/collaborator-preparation";
import { parseDateBR } from "@/lib/date-br";
import { parseBulkText, parseCsvFile, parseXlsxFile } from "@/lib/colaboradores-io";
import { clearDraft, loadDraft, saveDraft } from "@/lib/draft-store";
import {
  addHistory,
  HISTORY_EVENT,
  loadHistory,
  removeHistory,
  type HistoryEntry,
} from "@/lib/history-store";
import { registerCertificateEmission } from "@/lib/certificate-audit";

export const Route = createFileRoute("/certificados")({
  head: () => ({
    meta: [
      { title: "Certificados de treinamento — Volga SST" },
      {
        name: "description",
        content:
          "Emissão de certificados de treinamento Volga em PPTX, com modelos, colaboradores e histórico.",
      },
      { property: "og:title", content: "Certificados de treinamento — Volga SST" },
      {
        property: "og:description",
        content:
          "Emissão de certificados de treinamento Volga em PPTX, com modelos, colaboradores e histórico.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CertificadosPage,
});

const STEPS = [
  { label: "Modelo", hint: "Escolha ou salve um modelo" },
  { label: "Treinamento", hint: "Curso, data e conteúdo" },
  { label: "Empresa e instrutor", hint: "Dados fixos do certificado" },
  { label: "Colaboradores", hint: "Lista e geração" },
] as const;

function CertificadosPage() {
  const {
    user,
    role,
    roleLoading,
    loading: authLoading,
    isConfigured: cloudConfigured,
    signOut,
  } = useAuth();
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [syncingTemplates, setSyncingTemplates] = useState(false);

  const [shared, setShared] = useState<SharedFields>(DEFAULT_SHARED);
  const {
    templates,
    setTemplates,
    currentTplId,
    setCurrentTplId,
    newTplName,
    setNewTplName,
    renameOpen,
    setRenameOpen,
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    renameValue,
    setRenameValue,
    currentTpl,
    isDirty,
    handleLoadTemplate,
    handleSaveAs,
    handleUpdateCurrent,
    handleDeleteCurrent,
    confirmDeleteTemplate,
    handleDuplicate,
    handleRename,
    submitRename,
    handleExportTemplates,
    handleImportTemplatesFile,
  } = useTemplateManagement(user, shared, setShared);
  const {
    instructors,
    instructorsOpen,
    setInstructorsOpen,
    newInstName,
    setNewInstName,
    applyInstructor,
    applyMeioInstructor,
    clearMeioInstructor,
    saveCurrentInstructor,
    deleteInstructor,
    renameInstructorById,
    currentInstructorId,
    meioAberto,
    setMeioAberto,
    usaInstrutorMeioDiferente,
    currentMeioInstructorId,
  } = useInstructors(shared, setShared);
  const [cols, setCols] = useState<Colaborador[]>(DEFAULT_COLABORADORES);
  // Espelha `cols` sem entrar nas deps do useCallback: permite que removeCol
  // leia o valor mais recente (para o toast de "Desfazer") sem precisar
  // depender de `cols` — o que quebraria a memoização de <ColRow> a cada
  // keystroke (ver comentário em updateCol/toggleColIncluded acima).
  const colsRef = useRef(cols);
  colsRef.current = cols;
  const [loading, setLoading] = useState(false);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [step, setStep] = useState(0);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkMode, setBulkMode] = useState<"append" | "replace">("replace");

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [batchMode, setBatchMode] = useState(false);
  const [batchIds, setBatchIds] = useState<string[]>([]);

  // Instrutores salvos (local; built-ins fixos injetados)

  // Preferências de geração
  const [downloadMode, setDownloadMode] = useState<"merged" | "per-person">("merged");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [generationStarted, setGenerationStarted] = useState<number | null>(null);
  const [generationCurrent, setGenerationCurrent] = useState("");
  const [generationError, setGenerationError] = useState("");
  const [batchStatus, setBatchStatus] = useState<Record<string, string>>({});
  const [preparationSummary, setPreparationSummary] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const generationLockRef = useRef(false);

  // Filtro / busca / seleção múltipla de colaboradores
  const [colFilter, setColFilter] = useState("");
  const [colStatus, setColStatus] = useState<"all" | "included" | "excluded" | "invalid">("all");
  const [selected, setSelected] = useState<Set<number>>(() => new Set());

  // Carta de anuência
  const [anuenciaOpen, setAnuenciaOpen] = useState(false);
  const [anuenciaLoading, setAnuenciaLoading] = useState(false);
  const [anuenciaSel, setAnuenciaSel] = useState<Set<number>>(() => new Set());
  const [anuenciaNrs, setAnuenciaNrs] = useState<Record<AnuenciaNr, boolean>>({
    nr10: false,
    nr12: false,
    nr33: false,
    nr35: false,
  });

  const [anuenciaData, setAnuenciaData] = useState<string>(() => format(new Date(), "yyyy-MM-dd"));

  // Termo de Regras de Ouro
  const [regrasOpen, setRegrasOpen] = useState(false);
  const [regrasLoading, setRegrasLoading] = useState(false);
  const [regrasSel, setRegrasSel] = useState<Set<number>>(() => new Set());
  const [regrasData, setRegrasData] = useState<string>(() => format(new Date(), "yyyy-MM-dd"));
  const [regrasCidade, setRegrasCidade] = useState<string>("Ap. de Goiânia");

  const hydrated = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tplFileInputRef = useRef<HTMLInputElement>(null);

  // Mantém a lista em dia quando a sincronização com a equipe termina.
  useEffect(() => {
    const refresh = () => setHistory(loadHistory());
    window.addEventListener(HISTORY_EVENT, refresh);
    return () => window.removeEventListener(HISTORY_EVENT, refresh);
  }, []);

  // Hidratação (evita hydration-mismatch: só lê localStorage depois de montar)
  useEffect(() => {
    setHistory(loadHistory());
    const d = loadDraft();
    if (d && d.shared) {
      setShared(d.shared);
      if (Array.isArray(d.cols) && d.cols.length) setCols(d.cols);
      if (d.savedAt) setSavedAt(d.savedAt);
    }
    hydrated.current = true;
  }, []);

  // Carrega os modelos: da nuvem se logado, do localStorage caso contrário.
  // Ao logar pela primeira vez neste dispositivo, os modelos locais (se
  // houver) sobem para a nuvem automaticamente, sem duplicar por nome.
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    async function loadForUser() {
      const local = loadTemplates();

      if (!user) {
        if (!cancelled) setTemplates(local);
        return;
      }

      setSyncingTemplates(true);
      try {
        const cloud = await loadTemplatesCloud(user.id);
        const merged = await mergeLocalTemplatesIntoCloud(user.id, local, cloud);
        if (!cancelled) setTemplates(merged);
      } catch (err) {
        console.error("Falha ao sincronizar modelos com a nuvem:", err);
        toast.error("Não foi possível carregar seus modelos da nuvem. Mostrando cópia local.");
        if (!cancelled) setTemplates(local);
      } finally {
        if (!cancelled) setSyncingTemplates(false);
      }
    }

    loadForUser();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, setTemplates]);

  // Auto-save do rascunho (debounced)
  useEffect(() => {
    if (!hydrated.current) return;
    const id = window.setTimeout(() => {
      saveDraft({ shared, cols });
      setSavedAt(Date.now());
    }, 500);
    return () => window.clearTimeout(id);
  }, [shared, cols]);

  const activeCount = useMemo(
    () => cols.filter((c) => c.nome.trim() && c.incluir !== false).length,
    [cols],
  );

  const updateShared = <K extends keyof SharedFields>(key: K, value: SharedFields[K]) =>
    setShared((s) => ({ ...s, [key]: value }));

  // useCallback com deps vazias: usam setCols((prev) => ...) funcional, então a
  // identidade da função fica estável entre renders — isso é o que permite que
  // <ColRow> (React.memo) NÃO re-renderize as demais linhas quando o usuário
  // digita em uma delas.
  const updateCol = useCallback(
    (idx: number, key: keyof Colaborador, value: string) =>
      setCols((prev) =>
        prev.map((c, i) =>
          i === idx ? { ...c, [key]: key === "cpf" ? maskCPF(value) : value } : c,
        ),
      ),
    [],
  );

  const toggleColIncluded = useCallback(
    (idx: number) =>
      setCols((prev) =>
        prev.map((c, i) => (i === idx ? { ...c, incluir: c.incluir === false ? true : false } : c)),
      ),
    [],
  );

  const selectAllCols = () => setCols((prev) => prev.map((c) => ({ ...c, incluir: true })));

  const selectNoneCols = () =>
    setCols((prev) => prev.map((c) => (c.nome.trim() ? { ...c, incluir: false } : c)));

  const addCol = () => {
    if (cols.length >= MAX_COLABORADORES) {
      toast.warning(`Limite de ${MAX_COLABORADORES} colaboradores atingido`);
      return;
    }
    setCols((prev) => [...prev, { nome: "", cpf: "" }]);
  };
  const removeCol = useCallback((idx: number) => {
    if (colsRef.current.length <= 1) return;
    const removed = colsRef.current[idx];
    setCols((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
    if (!removed) return;
    const label = removed.nome.trim() || `colaborador ${idx + 1}`;
    toast(`"${label}" removido`, {
      action: {
        label: "Desfazer",
        onClick: () =>
          setCols((prev) => {
            const next = [...prev];
            next.splice(Math.min(idx, next.length), 0, removed);
            return next;
          }),
      },
    });
  }, []);
  const duplicateCol = useCallback((idx: number) => {
    // Checagem de limite feita dentro do updater funcional (com base em `prev`,
    // não na variável `cols` capturada) para ficar atômica e evitar passar de
    // MAX_COLABORADORES em cliques duplos rápidos.
    setCols((prev) => {
      if (prev.length >= MAX_COLABORADORES) {
        toast.warning(`Limite de ${MAX_COLABORADORES} colaboradores atingido`);
        return prev;
      }
      const next = [...prev];
      next.splice(idx + 1, 0, { ...prev[idx] });
      return next;
    });
  }, []);
  const moveCol = useCallback(
    (idx: number, dir: -1 | 1) =>
      setCols((prev) => {
        const j = idx + dir;
        if (j < 0 || j >= prev.length) return prev;
        const next = [...prev];
        [next[idx], next[j]] = [next[j], next[idx]];
        return next;
      }),
    [],
  );
  const clearEmpty = async () => {
    const emptyCount = cols.filter((c) => !c.nome.trim() && !c.cpf.trim()).length;
    if (!emptyCount) {
      toast.info("Nenhuma linha vazia para remover");
      return;
    }
    if (
      !(await confirmar({
        titulo: `Remover ${emptyCount} linha(s) vazia(s)?`,
        descricao: "Só as linhas sem nome e sem CPF saem da lista.",
        confirmar: "Remover linhas",
      }))
    )
      return;
    setCols((prev) => {
      const kept = prev.filter((c) => c.nome.trim() || c.cpf.trim());
      return kept.length ? kept : [{ nome: "", cpf: "" }];
    });
    toast.success(`${emptyCount} linha(s) vazia(s) removida(s)`);
  };

  const addManyCols = (n: number) => {
    const room = MAX_COLABORADORES - cols.length;
    if (room <= 0) {
      toast.warning(`Limite de ${MAX_COLABORADORES} colaboradores atingido`);
      return;
    }
    const add = Math.min(n, room);
    setCols((prev) => [...prev, ...Array.from({ length: add }, () => ({ nome: "", cpf: "" }))]);
    if (add < n) toast.warning(`Só havia espaço para ${add} linha(s).`);
  };

  const dedupeCols = () => {
    const result = prepareCollaborators(cols);
    setCols(result.cols);
    setSelected(new Set());
    setPreviewIdx(0);
    const summary = `${result.removed} duplicado(s) removido(s) · ${result.reformatted} CPF(s) formatado(s) · pendências: ${result.missingCpf} sem CPF, ${result.invalidCpf} CPF(s) inválido(s), ${result.missingName} sem nome, ${result.conflicts} homônimo(s) com CPFs diferentes para revisão.`;
    setPreparationSummary(summary);
    toast.info(summary);
  };

  const sortColsByName = () => {
    const sorted = [...cols].sort((a, b) => {
      const an = a.nome.trim().toLocaleLowerCase("pt-BR");
      const bn = b.nome.trim().toLocaleLowerCase("pt-BR");
      if (!an && bn) return 1;
      if (an && !bn) return -1;
      return an.localeCompare(bn, "pt-BR");
    });
    setCols(sorted);
    setSelected(new Set());
    toast.success("Colaboradores ordenados por nome");
  };

  const fixCpfs = () => {
    let fixed = 0;
    const next = cols.map((c) => {
      const masked = maskCPF(c.cpf);
      if (masked !== c.cpf) fixed += 1;
      return { ...c, cpf: masked };
    });
    setCols(next);
    toast.success(fixed ? `${fixed} CPF(s) reformatados` : "CPFs já estavam formatados");
  };

  // ---------- Filtro / seleção múltipla ----------
  const visibleIdxs = useMemo(() => {
    const q = colFilter.trim().toLocaleLowerCase("pt-BR");
    const qDigits = q.replace(/\D/g, "");
    return cols
      .map((_, i) => i)
      .filter((i) => {
        const c = cols[i];
        if (colStatus === "included" && c.incluir === false) return false;
        if (colStatus === "excluded" && c.incluir !== false) return false;
        if (colStatus === "invalid" && !(c.cpf.trim() && !isValidCPF(c.cpf))) return false;
        if (!q) return true;
        const nomeMatch = normalizedName(c.nome).includes(normalizedName(q));
        const cpfMatch = qDigits ? c.cpf.replace(/\D/g, "").includes(qDigits) : false;
        return nomeMatch || cpfMatch;
      });
  }, [cols, colFilter, colStatus]);

  const invalidCount = useMemo(
    () => cols.filter((c) => c.cpf.trim() && !isValidCPF(c.cpf)).length,
    [cols],
  );

  const duplicates = useMemo(() => duplicateIndices(cols), [cols]);
  const duplicateCount = duplicates.size;

  const toggleSelect = useCallback(
    (i: number) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(i)) next.delete(i);
        else next.add(i);
        return next;
      }),
    [],
  );
  const selectAllVisible = () => setSelected(new Set(visibleIdxs));
  const clearSelection = () => setSelected(new Set());

  const bulkDelete = async () => {
    if (!selected.size) return;
    if (
      !(await confirmar({
        titulo: `Excluir ${selected.size} colaborador(es) da lista?`,
        descricao: "Esta ação não pode ser desfeita.",
        confirmar: "Excluir",
        perigo: true,
      }))
    )
      return;
    const kept = cols.filter((_, i) => !selected.has(i));
    const out = kept.length ? kept : [{ nome: "", cpf: "" }];
    setCols(out);
    toast.success(`${selected.size} colaborador(es) removido(s)`);
    setSelected(new Set());
    if (previewIdx >= out.length) setPreviewIdx(0);
  };

  const bulkSetIncluded = (incluir: boolean) => {
    if (!selected.size) return;
    setCols((prev) => prev.map((c, i) => (selected.has(i) ? { ...c, incluir } : c)));
    toast.success(
      `${selected.size} ${incluir ? "marcado(s) para incluir" : "excluído(s) da geração"}`,
    );
  };

  const bulkDuplicate = () => {
    if (!selected.size) return;
    const room = MAX_COLABORADORES - cols.length;
    if (room <= 0) {
      toast.warning(`Limite de ${MAX_COLABORADORES} atingido`);
      return;
    }
    const dups = cols
      .filter((_, i) => selected.has(i))
      .slice(0, room)
      .map((c) => ({ ...c }));
    setCols((prev) => [...prev, ...dups]);
    toast.success(`${dups.length} duplicado(s)`);
  };

  const applyBulk = () => {
    const parsed = parseBulkText(bulkText);
    if (!parsed.length) {
      toast.error("Nenhum colaborador reconhecido");
      return;
    }
    const merged = bulkMode === "replace" ? parsed : [...cols, ...parsed];
    if (merged.length > MAX_COLABORADORES) {
      toast.warning(`Limite de ${MAX_COLABORADORES} — extras ignorados.`);
    }
    const finalCols = merged.slice(0, MAX_COLABORADORES);
    setCols(finalCols);
    setSelected(new Set());
    setPreviewIdx(0);
    setPreparationSummary("");
    setBulkOpen(false);
    setBulkText("");
    toast.success(
      `${Math.min(parsed.length, MAX_COLABORADORES)} colaborador(es) importado(s)${cpfIssuesSuffix(finalCols)}`,
    );
  };

  // Aponta de imediato, no toast, quantos colaboradores vieram sem CPF ou com
  // CPF invAlido — a validação (isValidCPF) já existe no restante da tela,
  // mas só aparecia depois, ao rolar a lista ou tentar gerar.
  const cpfIssuesSuffix = (list: { cpf: string }[]): string => {
    const issues = list.filter((c) => !c.cpf.trim() || !isValidCPF(c.cpf)).length;
    return issues > 0 ? ` — ${issues} com CPF ausente/inválido` : "";
  };

  const handleFileImport = async (file: File) => {
    try {
      const parsed = /\.xlsx?$/i.test(file.name)
        ? await parseXlsxFile(file)
        : await parseCsvFile(file);
      if (!parsed.length) {
        toast.error("Arquivo sem colaboradores reconhecíveis");
        return;
      }
      if (parsed.length > MAX_COLABORADORES) {
        toast.warning(`Limite de ${MAX_COLABORADORES} — extras ignorados.`);
      }
      const finalCols = parsed.slice(0, MAX_COLABORADORES);
      setCols(finalCols);
      setSelected(new Set());
      setPreviewIdx(0);
      setPreparationSummary("");
      toast.success(
        `${Math.min(parsed.length, MAX_COLABORADORES)} colaborador(es) importado(s)${cpfIssuesSuffix(finalCols)}`,
      );
    } catch (e) {
      console.error(e);
      toast.error("Falha ao ler o arquivo");
    }
  };

  const parsedDate = useMemo(() => parseDateBR(shared.data), [shared.data]);
  const dateInvalid = useMemo(
    () => shared.data.trim().length > 0 && !parsedDate,
    [shared.data, parsedDate],
  );

  const handleDownload = useCallback(async () => {
    if (generationLockRef.current) {
      toast.info("Já existe uma geração em andamento nesta tela.");
      return;
    }
    if (cloudConfigured && (!user || roleLoading || !can(role, "certificados.emit"))) {
      toast.error(explainDenied("certificados.emit"));
      return;
    }
    if (activeCount === 0) {
      toast.error("Preencha ao menos um colaborador");
      return;
    }
    // Campos obrigatórios do treinamento
    const missing: string[] = [];
    if (!shared.treinamento.trim()) missing.push("Treinamento");
    if (!shared.data.trim()) missing.push("Data");
    if (!shared.instrutorNome.trim()) missing.push("Instrutor");
    if (!shared.empresa.trim()) missing.push("Empresa");
    if (missing.length) {
      toast.error(`Preencha: ${missing.join(", ")}`);
      return;
    }
    if (dateInvalid) {
      toast.warning("Data em formato incomum — confira o texto que sairá no certificado.");
    }
    if (duplicateCount > 0) {
      toast.warning(`${duplicateCount} colaborador(es) duplicado(s) na lista.`);
    }
    // Pré-aviso de CPFs inválidos entre os incluídos
    const invalidIncluded = cols.filter(
      (c) => c.nome.trim() && c.incluir !== false && c.cpf.trim() && !isValidCPF(c.cpf),
    ).length;
    if (invalidIncluded > 0) {
      toast.warning(
        `${invalidIncluded} colaborador(es) com CPF inválido serão gerados mesmo assim.`,
      );
    }
    generationLockRef.current = true;
    setLoading(true);
    setProgress({ done: 0, total: 1 });
    setGenerationStarted(Date.now());
    setGenerationCurrent("");
    setGenerationError("");
    setBatchStatus({});
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { generatePptx } = await carregarGeradorPptx();
      const result = await generatePptx(shared, cols, "certificados-volga.pptx", {
        singlePptx: downloadMode === "merged",
        perPerson: downloadMode === "per-person",
        signal: controller.signal,
        onProgress: (done, total) => {
          setProgress({ done, total });
          setBatchStatus((prev) => ({
            ...prev,
            ...(done > 0 ? { [`Bloco ${done}`]: "Concluído" } : {}),
            ...(done < total ? { [`Bloco ${done + 1}`]: "Em andamento" } : {}),
          }));
          if (downloadMode === "per-person") {
            const people = cols.filter((c) => c.nome.trim() && c.incluir !== false);
            setGenerationCurrent(people[Math.min(done, people.length - 1)]?.nome || "");
          }
        },
      });
      const list = addHistory({
        shared,
        cols,
        templateName: currentTpl?.name,
      });
      setHistory(list);
      let registrationWarning = "";
      try {
        if (cloudConfigured) await registerCertificateEmission(shared, cols, currentTpl?.name);
        else registrationWarning = "Emissão local: não aparece no painel do administrador.";
      } catch (error) {
        registrationWarning =
          error instanceof Error ? error.message : "Registro da emissão não confirmado.";
      }
      if (downloadMode === "per-person") {
        toast.success(`${result.chunks} PPTX gerados (um por pessoa) e empacotados em ZIP`);
      } else if (result.format === "zip") {
        toast.success(`${result.chunks} arquivos PPTX gerados e empacotados em ZIP`);
      } else if (result.chunks > 1) {
        toast.success(`PPTX único gerado (${result.chunks} blocos mesclados)`);
      } else {
        toast.success("PPTX gerado com sucesso!");
      }
      if (registrationWarning) toast.error(registrationWarning, { duration: 18000 });
    } catch (e) {
      console.error(e);
      if (e instanceof GenerationAbortedError) {
        toast.info("Geração cancelada");
      } else {
        setGenerationError(e instanceof Error ? e.message : "Erro ao gerar PPTX");
        toast.error(e instanceof Error ? e.message : "Erro ao gerar PPTX");
      }
    } finally {
      abortRef.current = null;
      generationLockRef.current = false;
      setLoading(false);
    }
  }, [
    activeCount,
    cols,
    shared,
    currentTpl,
    downloadMode,
    dateInvalid,
    duplicateCount,
    cloudConfigured,
    user,
    role,
    roleLoading,
  ]);

  const cancelGeneration = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const restoreHistory = (h: HistoryEntry) => {
    setShared(normalizeShared(h.shared));
    setCols(h.cols);
    setHistoryOpen(false);
    toast.success("Certificado carregado do histórico");
  };

  const regenerate = async (h: HistoryEntry) => {
    if (generationLockRef.current) {
      toast.info("Aguarde a geração atual terminar.");
      return;
    }
    generationLockRef.current = true;
    setLoading(true);
    try {
      const { generatePptx } = await carregarGeradorPptx();
      await generatePptx(normalizeShared(h.shared), h.cols);
      toast.success("PPTX gerado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      generationLockRef.current = false;
      setLoading(false);
    }
  };

  const toggleBatchId = (id: string) =>
    setBatchIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const moveBatchId = (id: string, dir: -1 | 1) =>
    setBatchIds((prev) => {
      const i = prev.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const handleGenerateBatch = useCallback(async () => {
    if (generationLockRef.current) {
      toast.info("Já existe uma geração em andamento nesta tela.");
      return;
    }
    if (cloudConfigured && (!user || roleLoading || !can(role, "certificados.emit"))) {
      toast.error(explainDenied("certificados.emit"));
      return;
    }
    if (activeCount === 0) {
      toast.error("Preencha ao menos um colaborador");
      return;
    }
    if (batchIds.length === 0) {
      toast.error("Selecione ao menos um modelo");
      return;
    }
    const selected = batchIds
      .map((id) => templates.find((t) => t.id === id))
      .filter((t): t is SavedTemplate => !!t);
    if (!selected.length) {
      toast.error("Modelos selecionados não encontrados");
      return;
    }
    generationLockRef.current = true;
    setLoading(true);
    setProgress({ done: 0, total: 1 });
    setGenerationStarted(Date.now());
    setGenerationCurrent("");
    setGenerationError("");
    setBatchStatus(Object.fromEntries(selected.map((t) => [t.name, "Aguardando"])));
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      // A data de realização vem sempre do formulário atual (é o mesmo dia
      // do treinamento para todos os modelos do lote), sobrescrevendo o valor
      // salvo em cada template.
      const withCurrentDate = selected.map((t) => ({
        shared: {
          ...t.shared,
          data: shared.data,
          instrutorNome: shared.instrutorNome,
          instrutorCargo: shared.instrutorCargo,
          instrutorRegistro: shared.instrutorRegistro,
          instrutorMeioNome: shared.instrutorMeioNome ?? "",
          instrutorMeioCargo: shared.instrutorMeioCargo ?? "",
          instrutorMeioRegistro: shared.instrutorMeioRegistro ?? "",
        },
        cols,
        name: t.name,
      }));
      const { generateBatchPptx } = await carregarGeradorPptx();
      const res = await generateBatchPptx(
        withCurrentDate,
        `certificados-volga-lote-${format(new Date(), "yyyy-MM-dd")}.pptx`,
        {
          signal: controller.signal,
          onProgress: (done, total) => {
            setProgress({ done, total });
            setBatchStatus((prev) => {
              const current = Object.keys(prev)
                .reverse()
                .find((key) => key.includes(" · bloco ") && prev[key].startsWith("Gerando"));
              return current ? { ...prev, [current]: "Concluído" } : prev;
            });
          },
          onCurrent: (model, person, block) => {
            setGenerationCurrent(person);
            setBatchStatus((prev) => ({
              ...prev,
              [model]: "Em andamento",
              [`${model} · bloco ${block}`]: `Gerando (${person})`,
            }));
          },
        },
      );
      // Um registro de histórico por modelo do lote
      const okNames = new Set(res.failed.map((f) => f.name));
      let list = history;
      const auditFailures: string[] = [];
      for (const e of withCurrentDate) {
        if (okNames.has(e.name || "")) continue;
        list = addHistory({ shared: e.shared, cols, templateName: `${e.name} (lote)` });
        if (cloudConfigured) {
          try {
            await registerCertificateEmission(e.shared, cols, `${e.name} (lote)`);
          } catch {
            auditFailures.push(e.name || "Modelo sem nome");
          }
        } else auditFailures.push(e.name || "Modelo sem nome");
      }
      setHistory(list);

      setBatchStatus((prev) => ({
        ...prev,
        ...Object.fromEntries(
          selected.map((t) => [
            t.name,
            res.failed.find((f) => f.name === t.name)?.error || "Concluído",
          ]),
        ),
      }));
      if (res.failed.length) {
        toast.warning(
          `Lote gerado com ${res.failed.length} modelo(s) com falha: ${res.failed
            .map((f) => f.name)
            .join(", ")}`,
        );
      } else {
        toast.success(`Lote gerado: ${selected.length} treinamento(s) em um único PPTX`);
      }
      if (auditFailures.length)
        toast.error(
          `${auditFailures.length} emissão(ões) gerada(s) sem registro central confirmado: ${auditFailures.join(", ")}. Confira antes de repetir.`,
          { duration: 18000 },
        );
    } catch (e) {
      console.error(e);
      if (e instanceof GenerationAbortedError) {
        toast.info("Geração do lote cancelada");
      } else {
        setGenerationError(e instanceof Error ? e.message : "Erro ao gerar lote");
        toast.error(e instanceof Error ? e.message : "Erro ao gerar lote");
      }
    } finally {
      abortRef.current = null;
      generationLockRef.current = false;
      setLoading(false);
    }
  }, [
    activeCount,
    batchIds,
    cols,
    history,
    shared.data,
    shared.instrutorCargo,
    shared.instrutorNome,
    shared.instrutorRegistro,
    shared.instrutorMeioNome,
    shared.instrutorMeioCargo,
    shared.instrutorMeioRegistro,
    templates,
    cloudConfigured,
    user,
    role,
    roleLoading,
  ]);

  // Candidatos à carta de anuência: qualquer colaborador com nome preenchido.
  const anuenciaCandidates = useMemo(
    () => cols.map((c, i) => ({ c, i })).filter(({ c }) => c.nome.trim().length > 0),
    [cols],
  );

  const openAnuencia = useCallback(() => {
    const initial = cols
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.nome.trim() && c.incluir !== false)
      .map(({ i }) => i);
    setAnuenciaSel(new Set(initial));
    setAnuenciaOpen(true);
  }, [cols]);

  const toggleAnuencia = (idx: number) =>
    setAnuenciaSel((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });

  const handleGenerateAnuencia = useCallback(async () => {
    if (generationLockRef.current) {
      toast.info("Aguarde a geração atual terminar.");
      return;
    }
    const chosen = anuenciaCandidates.filter(({ i }) => anuenciaSel.has(i)).map(({ c }) => c);
    const entries = anuenciaFromColaboradores(chosen);
    if (!entries.length) {
      toast.error("Selecione ao menos um colaborador.");
      return;
    }
    const semCpf = entries.filter((e) => !e.cpf.trim()).length;
    const cpfInvalido = entries.filter((e) => e.cpf.trim() && !isValidCPF(e.cpf)).length;
    if (semCpf || cpfInvalido) {
      const partes = [
        semCpf ? `${semCpf} sem CPF` : "",
        cpfInvalido ? `${cpfInvalido} com CPF inválido` : "",
      ].filter(Boolean);
      if (
        !(await confirmar({
          titulo: "Gerar mesmo assim?",
          descricao: `Atenção: ${partes.join(" e ")}. Esses documentos sairão com o CPF em branco ou incorreto.`,
          confirmar: "Gerar mesmo assim",
        }))
      )
        return;
    }
    generationLockRef.current = true;
    setAnuenciaLoading(true);
    try {
      const { generateAnuenciaDocx } = await carregarGeradorAnuencia();
      const { count } = await generateAnuenciaDocx(
        entries,
        { nrs: anuenciaNrs, data: anuenciaData },
        `cartas-de-anuencia-${anuenciaData}.pdf`,
      );
      toast.success(`${count} carta(s) de anuência geradas em um único PDF.`);
      setAnuenciaOpen(false);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Erro ao gerar cartas");
    } finally {
      generationLockRef.current = false;
      setAnuenciaLoading(false);
    }
  }, [anuenciaCandidates, anuenciaSel, anuenciaNrs, anuenciaData]);

  // Candidatos ao Termo de Regras de Ouro: mesmo critério da carta de anuência.
  const regrasCandidates = useMemo(
    () => cols.map((c, i) => ({ c, i })).filter(({ c }) => c.nome.trim().length > 0),
    [cols],
  );

  const openRegras = useCallback(() => {
    const initial = cols
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.nome.trim() && c.incluir !== false)
      .map(({ i }) => i);
    setRegrasSel(new Set(initial));
    setRegrasOpen(true);
  }, [cols]);

  const toggleRegras = (idx: number) =>
    setRegrasSel((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });

  const handleGenerateRegras = useCallback(async () => {
    if (generationLockRef.current) {
      toast.info("Aguarde a geração atual terminar.");
      return;
    }
    const chosen = regrasCandidates.filter(({ i }) => regrasSel.has(i)).map(({ c }) => c);
    const entries = regrasDeOuroFromColaboradores(chosen);
    if (!entries.length) {
      toast.error("Selecione ao menos um colaborador.");
      return;
    }
    const semCpf = entries.filter((e) => !e.cpf.trim()).length;
    const cpfInvalido = entries.filter((e) => e.cpf.trim() && !isValidCPF(e.cpf)).length;
    if (semCpf || cpfInvalido) {
      const partes = [
        semCpf ? `${semCpf} sem CPF` : "",
        cpfInvalido ? `${cpfInvalido} com CPF inválido` : "",
      ].filter(Boolean);
      if (
        !(await confirmar({
          titulo: "Gerar mesmo assim?",
          descricao: `Atenção: ${partes.join(" e ")}. Esses documentos sairão com o CPF em branco ou incorreto.`,
          confirmar: "Gerar mesmo assim",
        }))
      )
        return;
    }
    generationLockRef.current = true;
    setRegrasLoading(true);
    try {
      const { generateRegrasDeOuroPdf } = await carregarGeradorRegrasDeOuro();
      const { count } = await generateRegrasDeOuroPdf(
        entries,
        { data: regrasData, cidade: regrasCidade },
        `termo-regras-de-ouro-${regrasData}.pdf`,
      );
      toast.success(`${count} termo(s) de Regras de Ouro gerado(s) em um único PDF.`);
      setRegrasOpen(false);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Erro ao gerar termos");
    } finally {
      generationLockRef.current = false;
      setRegrasLoading(false);
    }
  }, [regrasCandidates, regrasSel, regrasData, regrasCidade]);

  const preview = cols[Math.min(previewIdx, cols.length - 1)] ?? cols[0];

  const stepDone = [
    Boolean(currentTplId) || templates.length === 0,
    Boolean(shared.treinamento.trim() && shared.data.trim() && !dateInvalid),
    Boolean(shared.empresa.trim() && shared.instrutorNome.trim()),
    activeCount > 0,
  ];

  const certStats = (() => {
    const counts = history.map((h) => h.cols?.length ?? 0);
    const monthly = lastMonths(
      history.map((h) => h.createdAt),
      6,
      counts,
    );
    const byName = new Map<string, number>();
    history.forEach((h, i) => {
      const k = h.templateName || "Sem modelo";
      byName.set(k, (byName.get(k) ?? 0) + counts[i]);
    });
    const top = [...byName.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, value]) => ({ label, value }));
    return {
      monthly,
      top,
      emitted6m: monthly.reduce((s, m) => s + m.value, 0),
      thisMonth: monthly[monthly.length - 1]?.value ?? 0,
    };
  })();

  return (
    <AppFrame active="/certificados" userEmail={user?.email}>
      <div className="sst-tool-heading sst-mod-header">
        <div>
          <p className="sst-mod-crumb">
            <span className="sst-mod-code">MOD-CERT</span>Pessoas e saúde · Certificados
          </p>
          <h1>Gerador de certificados</h1>
          <p className="sst-mod-desc">Prepare treinamentos e emita documentos em lote.</p>
        </div>
        <div className="sst-tool-actions">
          <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
            <HistoryIcon className="h-4 w-4" /> Histórico ({history.length})
          </Button>
          <Button onClick={handleDownload} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Gerando…
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                {downloadMode === "per-person"
                  ? `Baixar ZIP (${activeCount})`
                  : `Baixar PPTX (${activeCount})`}
              </>
            )}
          </Button>
          {loading && (
            <Button variant="outline" onClick={cancelGeneration}>
              Cancelar
            </Button>
          )}
        </div>
      </div>
      {(loading || generationError || Object.keys(batchStatus).length > 0) && (
        <div
          className="sticky top-[72px] z-50 border-b border-border bg-background/95 px-6 py-3 shadow-sm"
          role="status"
          aria-live="polite"
        >
          <div className="mx-auto max-w-7xl space-y-2 text-sm">
            {loading && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>
                    Geração: {progress?.done ?? 0}/{progress?.total ?? 1} bloco(s) concluído(s) ·{" "}
                    {Math.max(0, (progress?.total ?? 1) - (progress?.done ?? 0))} restante(s)
                  </strong>
                  <Button size="sm" variant="outline" onClick={cancelGeneration}>
                    Cancelar geração
                  </Button>
                </div>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={progress?.total ?? 1}
                  aria-valuenow={progress?.done ?? 0}
                  className="h-2 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full bg-accent transition-all"
                    style={{
                      width: `${Math.min(100, Math.round(((progress?.done ?? 0) / Math.max(1, progress?.total ?? 1)) * 100))}%`,
                    }}
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  {generationCurrent ? `Colaborador atual: ${generationCurrent} · ` : ""}
                  {progress?.done && generationStarted
                    ? `Tempo estimado: ${Math.ceil((((Date.now() - generationStarted) / progress.done) * Math.max(0, progress.total - progress.done)) / 1000)} s`
                    : "Estimando tempo…"}
                </div>
              </>
            )}
            {generationError && (
              <p className="text-destructive">Falha na geração: {generationError}</p>
            )}
            {Object.entries(batchStatus).length > 0 && (
              <div className="max-h-28 overflow-y-auto text-xs" aria-label="Status dos modelos">
                {Object.entries(batchStatus).map(([name, status]) => (
                  <p key={name}>
                    {name}: {status}
                  </p>
                ))}
              </div>
            )}
            {!loading && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setGenerationError("");
                  setBatchStatus({});
                }}
              >
                Fechar status
              </Button>
            )}
          </div>
        </div>
      )}

      <main className="sst-main sst-tool-main sst-certificates">
        {/* Etapas */}
        <nav className="sst-certificate-steps mb-6" aria-label="Etapas do certificado">
          <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-accent transition-all duration-500"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STEPS.map((s, i) => {
              const active = step === i;
              const done = stepDone[i] && !active;
              return (
                <Button
                  variant="ghost"
                  key={s.label}
                  type="button"
                  onClick={() => setStep(i)}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "group flex h-auto items-center justify-start gap-2.5 whitespace-normal rounded-lg border px-3 py-3 text-left transition-colors",
                    active
                      ? "border-accent bg-accent/10 shadow-sm ring-1 ring-accent/40"
                      : "border-border bg-card hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-sm",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                      active
                        ? "bg-accent text-accent-foreground"
                        : done
                          ? "bg-success text-success-foreground"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{s.label}</span>
                    <span className="block text-xs text-muted-foreground">{s.hint}</span>
                  </span>
                </Button>
              );
            })}
          </div>
        </nav>

        <div className="sst-certificate-editor">
          <div className="space-y-6">
            {step === 0 && (
              <div className="space-y-6">
                {/* Modelos salvos */}
                <CollapsibleCard
                  storageKey="modelos"
                  title="Modelos salvos"
                  icon={<Layers className="h-5 w-5 text-accent" />}
                  subtitle={`${templates.length} salvo${templates.length === 1 ? "" : "s"}`}
                >
                  <p className="mb-3 text-xs text-muted-foreground">
                    Reaproveite treinamento, empresa e instrutor. Colaboradores não entram no
                    modelo.
                  </p>

                  {cloudConfigured && (
                    <div className="mb-3 flex items-center gap-1.5 text-xs">
                      {user ? (
                        syncingTemplates ? (
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Sincronizando com a nuvem…
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-success">
                            <Cloud className="h-3.5 w-3.5" />
                            Sincronizado na nuvem
                          </span>
                        )
                      ) : (
                        <button
                          onClick={() => setAuthDialogOpen(true)}
                          className="flex items-center gap-1.5 text-muted-foreground underline underline-offset-2 hover:text-foreground"
                        >
                          <CloudOff className="h-3.5 w-3.5" />
                          Salvo só neste dispositivo — entre para sincronizar
                        </button>
                      )}
                    </div>
                  )}

                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <Select value={currentTplId} onValueChange={handleLoadTemplate}>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            templates.length ? "Carregar modelo…" : "Nenhum modelo salvo ainda"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {[...templates]
                          .sort((a, b) => {
                            const aBuiltIn = isBuiltInTemplateId(a.id);
                            const bBuiltIn = isBuiltInTemplateId(b.id);
                            if (aBuiltIn && !bBuiltIn) return -1;
                            if (!aBuiltIn && bBuiltIn) return 1;
                            if (aBuiltIn && bBuiltIn) return a.name.localeCompare(b.name);
                            return b.updatedAt - a.updatedAt;
                          })
                          .map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {isBuiltInTemplateId(t.id) ? `★ ${t.name}` : t.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-1">
                      <IconBtn
                        title={
                          currentTpl && isBuiltInTemplateId(currentTpl.id)
                            ? "Modelo padrão — use Duplicar para editar"
                            : "Atualizar modelo com os dados atuais"
                        }
                        onClick={handleUpdateCurrent}
                        disabled={!currentTpl || isBuiltInTemplateId(currentTpl.id)}
                      >
                        <Save className="h-4 w-4" />
                      </IconBtn>
                      <IconBtn
                        title="Renomear"
                        onClick={handleRename}
                        disabled={!currentTpl || isBuiltInTemplateId(currentTpl.id)}
                      >
                        <Pencil className="h-4 w-4" />
                      </IconBtn>
                      <IconBtn title="Duplicar" onClick={handleDuplicate} disabled={!currentTpl}>
                        <Copy className="h-4 w-4" />
                      </IconBtn>
                      <IconBtn
                        title="Excluir"
                        onClick={handleDeleteCurrent}
                        disabled={!currentTpl || isBuiltInTemplateId(currentTpl.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </IconBtn>
                    </div>
                  </div>

                  {isDirty && currentTpl && (
                    <div className="mt-2 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-300">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Modelo modificado.
                      <button
                        onClick={handleUpdateCurrent}
                        className="ml-auto font-medium underline underline-offset-2"
                      >
                        Atualizar agora
                      </button>
                    </div>
                  )}

                  <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <Input
                      placeholder="Nome do novo modelo (ex.: NR 10 - Básico)"
                      value={newTplName}
                      onChange={(e) => setNewTplName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleSaveAs();
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      onClick={handleSaveAs}
                      className="bg-accent text-accent-foreground hover:bg-accent/90"
                    >
                      <BookmarkPlus className="mr-1.5 h-4 w-4" />
                      Salvar como
                    </Button>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleExportTemplates}
                      disabled={!templates.length}
                    >
                      <FileDown className="mr-1.5 h-4 w-4" />
                      Exportar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => tplFileInputRef.current?.click()}
                    >
                      <FileUp className="mr-1.5 h-4 w-4" />
                      Importar
                    </Button>
                    <input
                      ref={tplFileInputRef}
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleImportTemplatesFile(f);
                        e.target.value = "";
                      }}
                    />
                  </div>
                </CollapsibleCard>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-6">
                {/* Dados do Treinamento */}
                <CollapsibleCard
                  storageKey="treinamento"
                  title="Dados do Treinamento"
                  icon={<FileText className="h-5 w-5 text-accent" />}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Treinamento" full>
                      <Textarea
                        rows={3}
                        value={shared.treinamento}
                        onChange={(e) => updateShared("treinamento", e.target.value)}
                      />
                    </Field>
                    <Field label="Data de realização">
                      <div className="flex gap-2">
                        <Input
                          value={shared.data}
                          onChange={(e) => updateShared("data", e.target.value)}
                        />
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="icon" title="Selecionar data">
                              <CalendarIcon className="h-4 w-4" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="end">
                            <Calendar
                              mode="single"
                              selected={parsedDate}
                              defaultMonth={parsedDate}
                              onSelect={(d) =>
                                d &&
                                updateShared(
                                  "data",
                                  format(d, "d 'de' MMMM 'de' yyyy", { locale: ptBR }),
                                )
                              }
                              initialFocus
                              className={cn("p-3 pointer-events-auto")}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      {dateInvalid && (
                        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                          Formato não reconhecido. Use “15 de junho de 2026” ou 15/06/2026 (ou
                          escolha no calendário).
                        </p>
                      )}
                    </Field>
                    <Field label="Carga horária">
                      <Input
                        value={shared.cargaHoraria}
                        onChange={(e) => updateShared("cargaHoraria", e.target.value)}
                      />
                    </Field>
                    <Field label="Norma / Referência" full>
                      <Input
                        value={shared.normaRef}
                        onChange={(e) => updateShared("normaRef", e.target.value)}
                      />
                    </Field>
                    <Field label="Validade do treinamento (meses)">
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          min={0}
                          value={shared.validadeMeses ?? 0}
                          onChange={(e) =>
                            updateShared("validadeMeses", Number(e.target.value) || 0)
                          }
                          className="w-28"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const sug = suggestValidadeMeses(shared.normaRef);
                            if (sug === undefined) {
                              toast.info("Não há sugestão para essa norma — informe manualmente.");
                              return;
                            }
                            updateShared("validadeMeses", sug);
                          }}
                        >
                          Sugerir
                        </Button>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {shared.validadeMeses
                          ? `Certificados gerados com este modelo vencem ${shared.validadeMeses} meses após a data de realização.`
                          : "0 = sem prazo de reciclagem definido (não aparece como vencendo no painel Validades)."}
                      </p>
                    </Field>
                  </div>
                </CollapsibleCard>

                {/* Conteúdo Programático */}
                <CollapsibleCard
                  storageKey="conteudo"
                  title="Conteúdo Programático"
                  icon={<ListChecks className="h-5 w-5 text-accent" />}
                  subtitle={`${shared.conteudoProgramatico.length} tópico${shared.conteudoProgramatico.length === 1 ? "" : "s"}`}
                >
                  <p className="mb-3 text-xs text-muted-foreground">
                    Tópicos exibidos no verso do certificado (bullets). Um por linha.
                  </p>
                  <div className="space-y-2">
                    {shared.conteudoProgramatico.map((t, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <span className="mt-2.5 text-xs text-muted-foreground w-5 text-right">
                          {i + 1}.
                        </span>
                        <Input
                          value={t}
                          onChange={(e) =>
                            setShared((s) => ({
                              ...s,
                              conteudoProgramatico: s.conteudoProgramatico.map((x, j) =>
                                j === i ? e.target.value : x,
                              ),
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              setShared((s) => ({
                                ...s,
                                conteudoProgramatico: [
                                  ...s.conteudoProgramatico.slice(0, i + 1),
                                  "",
                                  ...s.conteudoProgramatico.slice(i + 1),
                                ],
                              }));
                            }
                          }}
                          placeholder={`Tópico ${i + 1}`}
                        />
                        <IconBtn
                          title="Mover para cima"
                          onClick={() =>
                            setShared((s) => {
                              if (i === 0) return s;
                              const next = [...s.conteudoProgramatico];
                              [next[i - 1], next[i]] = [next[i], next[i - 1]];
                              return { ...s, conteudoProgramatico: next };
                            })
                          }
                          disabled={i === 0}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </IconBtn>
                        <IconBtn
                          title="Mover para baixo"
                          onClick={() =>
                            setShared((s) => {
                              if (i === s.conteudoProgramatico.length - 1) return s;
                              const next = [...s.conteudoProgramatico];
                              [next[i], next[i + 1]] = [next[i + 1], next[i]];
                              return { ...s, conteudoProgramatico: next };
                            })
                          }
                          disabled={i === shared.conteudoProgramatico.length - 1}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </IconBtn>
                        <IconBtn
                          title="Remover"
                          onClick={() =>
                            setShared((s) => ({
                              ...s,
                              conteudoProgramatico:
                                s.conteudoProgramatico.length <= 1
                                  ? s.conteudoProgramatico
                                  : s.conteudoProgramatico.filter((_, j) => j !== i),
                            }))
                          }
                          disabled={shared.conteudoProgramatico.length <= 1}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconBtn>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setShared((s) => ({
                          ...s,
                          conteudoProgramatico: [...s.conteudoProgramatico, ""],
                        }))
                      }
                    >
                      <Plus className="mr-1.5 h-4 w-4" />
                      Adicionar tópico
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setShared((s) => ({
                          ...s,
                          conteudoProgramatico: [...DEFAULT_CONTEUDO_PROGRAMATICO],
                        }))
                      }
                    >
                      <RotateCcw className="mr-1.5 h-4 w-4" />
                      Restaurar padrão NR 06
                    </Button>
                  </div>
                </CollapsibleCard>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <CollapsibleCard
                  storageKey="empresa"
                  title="Empresa"
                  icon={<FileText className="h-5 w-5 text-accent" />}
                >
                  <div className="grid gap-4">
                    <Field label="Razão social">
                      <Input
                        value={shared.empresa}
                        onChange={(e) => updateShared("empresa", e.target.value)}
                      />
                    </Field>
                    <Field label="Endereço">
                      <Textarea
                        rows={2}
                        value={shared.endereco}
                        onChange={(e) => updateShared("endereco", e.target.value)}
                      />
                    </Field>
                    <Field label="CNPJ">
                      <Input
                        value={shared.cnpj}
                        onChange={(e) => updateShared("cnpj", e.target.value)}
                      />
                    </Field>
                  </div>
                </CollapsibleCard>

                {/* Instrutor */}
                <CollapsibleCard
                  storageKey="instrutor"
                  title="Instrutor"
                  icon={<User className="h-5 w-5 text-accent" />}
                  subtitle={`${instructors.length} salvo${instructors.length === 1 ? "" : "s"}`}
                >
                  <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <Select value={currentInstructorId} onValueChange={applyInstructor}>
                      <SelectTrigger>
                        <SelectValue placeholder="Escolher instrutor salvo…" />
                      </SelectTrigger>
                      <SelectContent>
                        {[...instructors]
                          .sort((a, b) => {
                            const ab = isBuiltInInstructorId(a.id);
                            const bb = isBuiltInInstructorId(b.id);
                            if (ab && !bb) return -1;
                            if (!ab && bb) return 1;
                            return a.name.localeCompare(b.name);
                          })
                          .map((i) => (
                            <SelectItem key={i.id} value={i.id}>
                              {isBuiltInInstructorId(i.id) ? `★ ${i.name}` : i.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={saveCurrentInstructor}
                        title="Salvar o instrutor atual do formulário"
                      >
                        <BookmarkPlus className="mr-1.5 h-4 w-4" />
                        Salvar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setInstructorsOpen(true)}>
                        Gerenciar
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Nome" full>
                      <Input
                        value={shared.instrutorNome}
                        onChange={(e) => updateShared("instrutorNome", e.target.value)}
                      />
                    </Field>
                    <Field label="Cargo">
                      <Input
                        value={shared.instrutorCargo}
                        onChange={(e) => updateShared("instrutorCargo", e.target.value)}
                      />
                    </Field>
                    <Field label="Registro">
                      <Input
                        value={shared.instrutorRegistro}
                        onChange={(e) => updateShared("instrutorRegistro", e.target.value)}
                      />
                    </Field>
                  </div>

                  <div className="mt-5 border-t border-border pt-4">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border"
                        checked={usaInstrutorMeioDiferente}
                        onChange={(e) => {
                          setMeioAberto(e.target.checked);
                          if (e.target.checked) {
                            setShared((s) => ({
                              ...s,
                              instrutorMeioNome: s.instrutorMeioNome || s.instrutorNome,
                              instrutorMeioCargo: s.instrutorMeioCargo || s.instrutorCargo,
                              instrutorMeioRegistro: s.instrutorMeioRegistro || s.instrutorRegistro,
                            }));
                          } else {
                            clearMeioInstructor();
                          }
                        }}
                      />
                      Definir outra pessoa para a assinatura central
                    </label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Em modelos com três assinaturas, esta opção altera somente a assinatura
                      central. A assinatura da direita continua usando o responsável principal
                      informado acima.
                    </p>

                    {usaInstrutorMeioDiferente && (
                      <div className="mt-3">
                        <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto]">
                          <Select
                            value={currentMeioInstructorId}
                            onValueChange={applyMeioInstructor}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Escolher pessoa para a assinatura central…" />
                            </SelectTrigger>
                            <SelectContent>
                              {[...instructors]
                                .sort((a, b) => {
                                  const ab = isBuiltInInstructorId(a.id);
                                  const bb = isBuiltInInstructorId(b.id);
                                  if (ab && !bb) return -1;
                                  if (!ab && bb) return 1;
                                  return a.name.localeCompare(b.name);
                                })
                                .map((i) => (
                                  <SelectItem key={i.id} value={i.id}>
                                    {isBuiltInInstructorId(i.id) ? `★ ${i.name}` : i.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label="Nome da assinatura central" full>
                            <Input
                              value={shared.instrutorMeioNome ?? ""}
                              onChange={(e) => updateShared("instrutorMeioNome", e.target.value)}
                            />
                          </Field>
                          <Field label="Cargo da assinatura central">
                            <Input
                              value={shared.instrutorMeioCargo ?? ""}
                              onChange={(e) => updateShared("instrutorMeioCargo", e.target.value)}
                            />
                          </Field>
                          <Field label="Registro da assinatura central">
                            <Input
                              value={shared.instrutorMeioRegistro ?? ""}
                              onChange={(e) =>
                                updateShared("instrutorMeioRegistro", e.target.value)
                              }
                            />
                          </Field>
                        </div>
                      </div>
                    )}
                  </div>
                </CollapsibleCard>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                {/* Colaboradores */}
                <CollapsibleCard
                  storageKey="colaboradores"
                  title="Colaboradores"
                  icon={<User className="h-5 w-5 text-accent" />}
                  subtitle={`${activeCount} preenchido${activeCount === 1 ? "" : "s"} · máx ${MAX_COLABORADORES}`}
                  right={
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
                        <ClipboardPaste className="mr-1.5 h-4 w-4" />
                        Colar lista
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="mr-1.5 h-4 w-4" />
                        CSV/XLSX
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={openAnuencia}
                        disabled={activeCount === 0}
                        title="Gerar carta de anuência (PDF)"
                      >
                        <FileSignature className="mr-1.5 h-4 w-4" />
                        Carta de anuência
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={openRegras}
                        disabled={activeCount === 0}
                        title="Gerar Termo de Regras de Ouro (PDF)"
                      >
                        <FileSignature className="mr-1.5 h-4 w-4" />
                        Regra de Ouro
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,.xlsx,.xls,text/csv"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleFileImport(f);
                          e.target.value = "";
                        }}
                      />
                    </div>
                  }
                >
                  <div className="mb-3 flex items-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-xs text-foreground">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {downloadMode === "per-person"
                      ? `${activeCount} PPTX individuais em um ZIP (curso-nome.pptx).`
                      : `${activeCount} certificado${activeCount === 1 ? "" : "s"} num único PPTX.`}
                  </div>

                  {/* Busca */}
                  <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={colFilter}
                        onChange={(e) => setColFilter(e.target.value)}
                        placeholder="Buscar por nome ou CPF…"
                        className="pl-8"
                      />
                      {colFilter && (
                        <button
                          onClick={() => setColFilter("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          title="Limpar busca"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={sortColsByName}
                      title="Ordenar por nome"
                    >
                      <ArrowUpDown className="mr-1.5 h-4 w-4" />
                      Ordenar
                    </Button>
                  </div>

                  {/* Barra de seleção múltipla */}
                  <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs">
                    <button
                      onClick={() =>
                        selected.size === visibleIdxs.length && visibleIdxs.length > 0
                          ? clearSelection()
                          : selectAllVisible()
                      }
                      className="inline-flex items-center gap-1.5 font-medium hover:text-foreground"
                      title="Selecionar todos os visíveis"
                    >
                      {selected.size > 0 && selected.size === visibleIdxs.length ? (
                        <CheckSquare className="h-3.5 w-3.5" />
                      ) : (
                        <Square className="h-3.5 w-3.5" />
                      )}
                      Selecionar {colFilter || colStatus !== "all" ? "visíveis" : "todos"} (
                      {visibleIdxs.length})
                    </button>
                    {selected.size > 0 ? (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <span className="font-medium">{selected.size} selecionado(s)</span>
                        <div className="ml-auto flex flex-wrap gap-1">
                          <Button size="sm" variant="outline" onClick={() => bulkSetIncluded(true)}>
                            Incluir
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => bulkSetIncluded(false)}
                          >
                            Excluir
                          </Button>
                          <Button size="sm" variant="outline" onClick={bulkDuplicate}>
                            <Copy className="mr-1.5 h-3.5 w-3.5" />
                            Duplicar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={bulkDelete}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                            Remover
                          </Button>
                          <Button size="sm" variant="ghost" onClick={clearSelection}>
                            <X className="mr-1 h-3.5 w-3.5" />
                            Limpar
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="ml-auto flex gap-1">
                        <Button size="sm" variant="ghost" onClick={selectAllCols}>
                          Incluir todos
                        </Button>
                        <Button size="sm" variant="ghost" onClick={selectNoneCols}>
                          Excluir todos
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    {visibleIdxs.length === 0 && (
                      <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                        Nenhum colaborador corresponde ao filtro.
                      </div>
                    )}
                    {visibleIdxs.map((i) => {
                      const c = cols[i];
                      const cpfInvalid = c.cpf.trim() !== "" && !isValidCPF(c.cpf);
                      const included = c.incluir !== false;
                      return (
                        <ColRow
                          key={i}
                          index={i}
                          nome={c.nome}
                          cpf={c.cpf}
                          included={included}
                          isSelected={selected.has(i)}
                          isPreview={previewIdx === i}
                          cpfInvalid={cpfInvalid}
                          duplicated={duplicates.has(i)}
                          isFirst={i === 0}
                          isLast={i === cols.length - 1}
                          isOnly={cols.length <= 1}
                          onUpdate={updateCol}
                          onToggleSelect={toggleSelect}
                          onToggleIncluded={toggleColIncluded}
                          onSetPreview={setPreviewIdx}
                          onMove={moveCol}
                          onDuplicate={duplicateCol}
                          onRemove={removeCol}
                          onEnterAtLast={addCol}
                        />
                      );
                    })}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" onClick={dedupeCols}>
                      <Wand2 className="mr-1.5 h-4 w-4" />
                      Preparar lista
                    </Button>
                    <Button size="sm" variant="outline" onClick={addCol}>
                      <Plus className="mr-1.5 h-4 w-4" />
                      Adicionar colaborador
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => addManyCols(10)}>
                      <Plus className="mr-1.5 h-4 w-4" />
                      +10 linhas
                    </Button>
                    <Button size="sm" variant="ghost" onClick={clearEmpty}>
                      Limpar vazios
                    </Button>
                    <Button size="sm" variant="ghost" onClick={dedupeCols}>
                      Remover duplicados
                    </Button>
                  </div>

                  {preparationSummary && (
                    <div
                      role="status"
                      className="mt-3 rounded-md border border-accent/40 bg-accent/5 p-2.5 text-xs"
                    >
                      <strong>Resultado da última preparação:</strong> {preparationSummary}
                    </div>
                  )}

                  {activeCount > 100 && (
                    <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-300">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Lista grande ({activeCount}). A geração pode levar alguns segundos.
                    </div>
                  )}

                  <div className="mt-3 rounded-md border border-border bg-muted/30 p-2.5 text-xs">
                    <div className="mb-2 font-medium text-foreground">Como você quer baixar?</div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <button
                        type="button"
                        onClick={() => {
                          setBatchMode(false);
                          setDownloadMode("merged");
                        }}
                        className={`rounded-md border px-3 py-2 text-left transition ${
                          !batchMode && downloadMode === "merged"
                            ? "border-accent bg-accent/10 text-foreground"
                            : "border-border hover:border-accent/60"
                        }`}
                      >
                        <div className="font-semibold">Tudo junto</div>
                        <div className="text-muted-foreground">
                          Um único PPTX com todos os certificados.
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBatchMode(false);
                          setDownloadMode("per-person");
                        }}
                        className={`rounded-md border px-3 py-2 text-left transition ${
                          !batchMode && downloadMode === "per-person"
                            ? "border-accent bg-accent/10 text-foreground"
                            : "border-border hover:border-accent/60"
                        }`}
                      >
                        <div className="font-semibold">Um por pessoa</div>
                        <div className="text-muted-foreground">
                          ZIP com um PPTX por colaborador — <code>curso-nome.pptx</code>.
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setBatchMode(true)}
                        className={`rounded-md border px-3 py-2 text-left transition ${
                          batchMode
                            ? "border-accent bg-accent/10 text-foreground"
                            : "border-border hover:border-accent/60"
                        }`}
                      >
                        <div className="font-semibold">Lote de treinamentos</div>
                        <div className="text-muted-foreground">
                          Vários modelos (ex.: NR 06 + NR 12) em um único PPTX.
                        </div>
                      </button>
                    </div>
                    {batchMode && (
                      <div className="mt-3 space-y-2">
                        {templates.length === 0 && (
                          <p className="text-muted-foreground">
                            Salve pelo menos um modelo na etapa 1 para usar o lote.
                          </p>
                        )}
                        {templates.length > 0 && (
                          <>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setBatchIds(templates.map((t) => t.id))}
                              >
                                Selecionar todos
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setBatchIds([])}
                                disabled={!batchIds.length}
                              >
                                Limpar modelos
                              </Button>
                            </div>
                            <div className="max-h-56 space-y-1 overflow-y-auto">
                              {templates.map((t) => {
                                const idxInBatch = batchIds.indexOf(t.id);
                                const checked = idxInBatch >= 0;
                                return (
                                  <div
                                    key={t.id}
                                    className={cn(
                                      "flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm",
                                      checked ? "border-accent bg-accent/5" : "border-border",
                                    )}
                                  >
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={() => toggleBatchId(t.id)}
                                    />
                                    <span className="flex-1 truncate">{t.name}</span>
                                    {checked && (
                                      <>
                                        <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground">
                                          #{idxInBatch + 1}
                                        </span>
                                        <IconBtn
                                          title="Mover para cima"
                                          onClick={() => moveBatchId(t.id, -1)}
                                          disabled={idxInBatch === 0}
                                        >
                                          <ArrowUp className="h-3.5 w-3.5" />
                                        </IconBtn>
                                        <IconBtn
                                          title="Mover para baixo"
                                          onClick={() => moveBatchId(t.id, 1)}
                                          disabled={idxInBatch === batchIds.length - 1}
                                        >
                                          <ArrowDown className="h-3.5 w-3.5" />
                                        </IconBtn>
                                      </>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </CollapsibleCard>

                <div className="rounded-lg border border-accent/40 bg-accent/5 p-4">
                  <div className="mb-2 text-sm font-semibold">Pronto para gerar</div>
                  <p className="mb-3 text-xs text-muted-foreground">
                    {activeCount} colaborador{activeCount === 1 ? "" : "es"} ·{" "}
                    {downloadMode === "per-person"
                      ? "ZIP com um arquivo por pessoa"
                      : "um único PPTX"}
                    {batchMode ? " · modo lote ativo" : ""}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={batchMode ? handleGenerateBatch : handleDownload}
                      disabled={loading || activeCount === 0}
                      className="bg-accent text-accent-foreground hover:bg-accent/90"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {progress ? `Gerando ${progress.done}/${progress.total}…` : "Gerando…"}
                        </>
                      ) : (
                        <>
                          <Download className="mr-2 h-4 w-4" />
                          Gerar certificados
                        </>
                      )}
                    </Button>
                    <Button variant="outline" onClick={openAnuencia} disabled={loading}>
                      <FileSignature className="mr-2 h-4 w-4" />
                      Carta de anuência
                    </Button>
                    <Button variant="outline" onClick={openRegras} disabled={loading}>
                      <FileSignature className="mr-2 h-4 w-4" />
                      Regra de Ouro
                    </Button>
                    {loading && (
                      <Button variant="ghost" onClick={cancelGeneration}>
                        Cancelar
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Navegação entre etapas */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
              >
                <ChevronLeft className="mr-1.5 h-4 w-4" />
                Voltar
              </Button>
              <span className="text-xs text-muted-foreground">
                Etapa {step + 1} de {STEPS.length} · {STEPS[step].label}
              </span>
              <Button
                onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                disabled={step === STEPS.length - 1}
              >
                Próximo
                <ChevronRight className="ml-1.5 h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-dashed border-border px-4 py-2 text-xs text-muted-foreground">
              <span>
                {savedAt
                  ? `Rascunho salvo às ${format(new Date(savedAt), "HH:mm:ss")}`
                  : "Rascunho salvo automaticamente no navegador"}
              </span>
              <button
                onClick={() => {
                  clearDraft();
                  setShared(DEFAULT_SHARED);
                  setCols(DEFAULT_COLABORADORES);
                  setCurrentTplId("");
                  setSavedAt(null);
                  toast.success("Rascunho descartado");
                }}
                className="inline-flex items-center gap-1 font-medium hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" />
                Descartar
              </button>
            </div>
          </div>

          {/* Preview */}
          <div className="sst-certificate-preview">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground">
                Pré-visualização · Colaborador {previewIdx + 1}
              </h2>
            </div>
            <CertificatePreview shared={shared} col={preview} />
          </div>
        </div>
      </main>

      {/* Login / cadastro na nuvem */}
      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renomear modelo</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitRename()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitRename}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete template confirmation */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir modelo?</DialogTitle>
            <DialogDescription>
              {currentTpl
                ? `O modelo "${currentTpl.name}" será removido para sempre, inclusive de outros dispositivos conectados à mesma conta. Essa ação não pode ser desfeita.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDeleteTemplate}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk paste dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Colar lista de colaboradores</DialogTitle>
            <DialogDescription>
              Um por linha. Formatos aceitos: <code>Nome; CPF</code>, <code>Nome, CPF</code>, ou
              colado do Excel (tab).
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={10}
            placeholder={"João da Silva; 123.456.789-00\nMaria Souza; 987.654.321-00"}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
          />
          <div className="flex gap-3 text-xs">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={bulkMode === "replace"}
                onChange={() => setBulkMode("replace")}
              />
              Substituir
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={bulkMode === "append"}
                onChange={() => setBulkMode("append")}
              />
              Adicionar ao final
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={applyBulk}>Importar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Histórico de certificados</DialogTitle>
            <DialogDescription>
              Últimos {history.length} certificado(s) gerado(s) neste navegador.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {history.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">Nada por aqui ainda.</p>
            )}
            {history.map((h) => (
              <div key={h.id} className="rounded-lg border border-border p-3 text-sm">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{h.shared.treinamento}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {h.shared.empresa} · {h.cols.filter((c) => c.nome).length} colaborador(es)
                      {h.templateName ? ` · ${h.templateName}` : ""}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {format(new Date(h.createdAt), "dd/MM/yyyy HH:mm")}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <IconBtn title="Carregar" onClick={() => restoreHistory(h)}>
                      <RotateCcw className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn title="Baixar novamente" onClick={() => regenerate(h)}>
                      <Download className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn
                      title="Excluir"
                      onClick={() => setHistory(removeHistory(h.id))}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconBtn>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Instructors manager dialog */}
      <Dialog open={instructorsOpen} onOpenChange={setInstructorsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Instrutores salvos</DialogTitle>
            <DialogDescription>
              Reaproveite instrutores nos próximos certificados. Os instrutores marcados com ★ são
              padrão e não podem ser editados.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-2 overflow-y-auto">
            {instructors.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum instrutor salvo ainda.</p>
            )}
            {instructors.map((it) => {
              const builtIn = isBuiltInInstructorId(it.id);
              return (
                <div
                  key={it.id}
                  className="flex items-start gap-2 rounded-md border border-border p-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Input
                        value={it.name}
                        disabled={builtIn}
                        onChange={(e) => renameInstructorById(it.id, e.target.value)}
                        className="h-8 text-sm"
                      />
                      {builtIn && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          PADRÃO
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground truncate">
                      {it.nome} · {it.cargo} · Reg: {it.registro}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        applyInstructor(it.id);
                        setInstructorsOpen(false);
                      }}
                    >
                      Usar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteInstructor(it.id)}
                      className="text-destructive hover:text-destructive"
                      title={builtIn ? "Ocultar este instrutor padrão" : "Remover instrutor"}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
            <Input
              placeholder="Nome para salvar o instrutor atual"
              value={newInstName}
              onChange={(e) => setNewInstName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  saveCurrentInstructor();
                }
              }}
            />
            <Button onClick={saveCurrentInstructor}>
              <BookmarkPlus className="mr-1.5 h-4 w-4" />
              Salvar atual
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInstructorsOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Carta de Anuência */}
      <Dialog open={anuenciaOpen} onOpenChange={setAnuenciaOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSignature className="h-4 w-4 text-accent" />
              Gerar Carta de Anuência
            </DialogTitle>
            <DialogDescription>
              Será gerado um único PDF usando o modelo original, com uma carta por colaborador
              selecionado. Apenas <strong>nome</strong> e <strong>CPF</strong> são substituídos — o
              restante do modelo permanece exatamente como está.
            </DialogDescription>
          </DialogHeader>

          <div className="mb-4">
            <Label htmlFor="anuencia-data" className="text-xs font-medium">
              Data da carta
            </Label>
            <Input
              id="anuencia-data"
              type="date"
              className="mt-1 w-48"
              value={anuenciaData}
              onChange={(e) => setAnuenciaData(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Aparece como "{anuenciaData.split("-").reverse().join("/")}" na carta. Por padrão é a
              data de hoje.
            </p>
          </div>

          <div className="rounded-md border border-border p-3">
            <p className="mb-2 text-xs font-medium">Atividades autorizadas (caixas marcadas)</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(ANUENCIA_NR_LABELS) as AnuenciaNr[]).map((nr) => (
                <label key={nr} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={anuenciaNrs[nr]}
                    onChange={(e) =>
                      setAnuenciaNrs((prev) => ({ ...prev, [nr]: e.target.checked }))
                    }
                  />
                  <span>{ANUENCIA_NR_LABELS[nr]}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent ring-1 ring-accent/30">
                {anuenciaSel.size} de {anuenciaCandidates.length} selecionado(s)
              </span>
              {anuenciaCandidates.filter(({ c }) => !c.cpf.trim() || !isValidCPF(c.cpf.trim()))
                .length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive ring-1 ring-destructive/30">
                  <AlertTriangle className="h-3 w-3" />
                  {
                    anuenciaCandidates.filter(({ c }) => !c.cpf.trim() || !isValidCPF(c.cpf.trim()))
                      .length
                  }{" "}
                  com CPF inválido/ausente
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setAnuenciaSel(new Set(anuenciaCandidates.map((x) => x.i)))}
              >
                Selecionar todos
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAnuenciaSel(new Set())}>
                Limpar
              </Button>
            </div>
          </div>

          <div className="max-h-[55vh] overflow-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/70 text-xs">
                <tr>
                  <th className="w-10 px-3 py-2 text-left"> </th>
                  <th className="px-3 py-2 text-left">Colaborador</th>
                  <th className="px-3 py-2 text-left">CPF</th>
                </tr>
              </thead>
              <tbody>
                {anuenciaCandidates.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                      Nenhum colaborador com nome preenchido.
                    </td>
                  </tr>
                )}
                {anuenciaCandidates.map(({ c, i }) => {
                  const cpf = c.cpf.trim();
                  const bad = !cpf || !isValidCPF(cpf);
                  return (
                    <tr
                      key={i}
                      onClick={() => toggleAnuencia(i)}
                      className={cn(
                        "cursor-pointer border-t border-border transition-colors hover:bg-accent/[0.06]",
                        bad && "bg-destructive/[0.04]",
                      )}
                    >
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Selecionar ${c.nome}`}
                          checked={anuenciaSel.has(i)}
                          onChange={() => toggleAnuencia(i)}
                        />
                      </td>
                      <td className="px-3 py-2 font-medium">{c.nome}</td>
                      <td
                        className={cn(
                          "px-3 py-2",
                          bad ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        <span className="inline-flex items-center gap-1">
                          {bad && <AlertTriangle className="h-3 w-3" />}
                          {cpf || "sem CPF"}
                          {cpf && bad ? " (inválido)" : ""}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAnuenciaOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleGenerateAnuencia}
              disabled={anuenciaLoading || anuenciaSel.size === 0}
            >
              {anuenciaLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gerando…
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Gerar PDF
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Termo de Regras de Ouro */}
      <Dialog open={regrasOpen} onOpenChange={setRegrasOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSignature className="h-4 w-4 text-accent" />
              Gerar Termo de Regras de Ouro
            </DialogTitle>
            <DialogDescription>
              Será gerado um único PDF usando o modelo original, com um termo por colaborador
              selecionado. Apenas <strong>nome</strong>, <strong>CPF</strong> e a{" "}
              <strong>data</strong> são substituídos — o restante do modelo permanece exatamente
              como está. A assinatura fica em branco para assinatura física.
            </DialogDescription>
          </DialogHeader>

          <div className="mb-4 flex flex-wrap gap-4">
            <div>
              <Label htmlFor="regras-data" className="text-xs font-medium">
                Data do termo
              </Label>
              <Input
                id="regras-data"
                type="date"
                className="mt-1 w-48"
                value={regrasData}
                onChange={(e) => setRegrasData(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Aparece como "{regrasData.split("-").reverse().join("/")}" no termo. Por padrão é a
                data de hoje.
              </p>
            </div>
            <div>
              <Label htmlFor="regras-cidade" className="text-xs font-medium">
                Cidade
              </Label>
              <Input
                id="regras-cidade"
                type="text"
                className="mt-1 w-56"
                value={regrasCidade}
                onChange={(e) => setRegrasCidade(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent ring-1 ring-accent/30">
                {regrasSel.size} de {regrasCandidates.length} selecionado(s)
              </span>
              {regrasCandidates.filter(({ c }) => !c.cpf.trim() || !isValidCPF(c.cpf.trim()))
                .length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive ring-1 ring-destructive/30">
                  <AlertTriangle className="h-3 w-3" />
                  {
                    regrasCandidates.filter(({ c }) => !c.cpf.trim() || !isValidCPF(c.cpf.trim()))
                      .length
                  }{" "}
                  com CPF inválido/ausente
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setRegrasSel(new Set(regrasCandidates.map((x) => x.i)))}
              >
                Selecionar todos
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRegrasSel(new Set())}>
                Limpar
              </Button>
            </div>
          </div>

          <div className="max-h-[55vh] overflow-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/70 text-xs">
                <tr>
                  <th className="w-10 px-3 py-2 text-left"> </th>
                  <th className="px-3 py-2 text-left">Colaborador</th>
                  <th className="px-3 py-2 text-left">CPF</th>
                </tr>
              </thead>
              <tbody>
                {regrasCandidates.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                      Nenhum colaborador com nome preenchido.
                    </td>
                  </tr>
                )}
                {regrasCandidates.map(({ c, i }) => {
                  const cpf = c.cpf.trim();
                  const bad = !cpf || !isValidCPF(cpf);
                  return (
                    <tr
                      key={i}
                      onClick={() => toggleRegras(i)}
                      className={cn(
                        "cursor-pointer border-t border-border transition-colors hover:bg-accent/[0.06]",
                        bad && "bg-destructive/[0.04]",
                      )}
                    >
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Selecionar ${c.nome}`}
                          checked={regrasSel.has(i)}
                          onChange={() => toggleRegras(i)}
                        />
                      </td>
                      <td className="px-3 py-2 font-medium">{c.nome}</td>
                      <td
                        className={cn(
                          "px-3 py-2",
                          bad ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        <span className="inline-flex items-center gap-1">
                          {bad && <AlertTriangle className="h-3 w-3" />}
                          {cpf || "sem CPF"}
                          {cpf && bad ? " (inválido)" : ""}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setRegrasOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleGenerateRegras} disabled={regrasLoading || regrasSel.size === 0}>
              {regrasLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gerando…
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Gerar PDF
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppFrame>
  );
}
