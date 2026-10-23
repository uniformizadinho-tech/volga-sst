import { createFileRoute, Link } from "@tanstack/react-router";
import { AppFrame } from "@/components/layout/app-frame";
import { diferenca, DiferencaBadge } from "@/components/estoque/estoque-helpers";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { saveAs } from "file-saver";
import {
  AlertTriangle,
  ArrowLeft,
  Barcode,
  Clock3,
  Cloud,
  CloudOff,
  Loader2,
  FileDown,
  Check,
  Download,
  HardDriveDownload,
  Package,
  Pencil,
  RotateCcw,
  ScanLine,
  Search,
  Undo2,
  Upload,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseEstoqueCatalogoFile, gerarWorkbookContagem } from "@/lib/estoque-io";
import { loadXlsx } from "@/lib/xlsx-lazy";
import { AuthDialog } from "@/components/auth/auth-dialog";
import { ResultadoContagem } from "@/components/painel/resultado-contagem";
import { GraficosContagem } from "@/components/painel/graficos-estoque";
import { useAuth } from "@/hooks/use-auth";
import { can, explainDenied } from "@/lib/permissions";
import { parseBackup } from "@/lib/backup";
import { createFullLocalBackup, stateFromBackup } from "@/lib/backup-snapshot";
import { recordOperation } from "@/lib/operation-audit";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  carregarEstoqueNuvem,
  gravarItensEstoqueNuvem,
  adicionarLancamentosEstoqueNuvem,
  removerLancamentosEstoqueNuvem,
  removerItensEstoqueNuvem,
  normalizarIdLancamento,
  reconciliarItensEstoque,
  carregarExclusoesPendentes,
  registrarExclusoesPendentes,
  limparExclusoesPendentes,
} from "@/lib/estoque-cloud";
import {
  carregarEstoqueItens,
  carregarLancamentos,
  mesclarCatalogoImportado,
  novoLancamento,
  salvarEstoqueItens,
  salvarLancamentos,
  somarContagemPorCodigo,
  validarBackupContagem,
  type EstoqueItem,
  type EstoqueLancamento,
} from "@/lib/estoque-store";

export const Route = createFileRoute("/estoque")({
  head: () => ({
    meta: [
      { property: "og:title", content: "Contagem de estoque — Volga SST" },
      {
        property: "og:description",
        content: "Conte EPIs e uniformes com leitor de código de barras e acompanhe divergências.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },

      { title: "Contagem de Estoque — Volga" },
      {
        name: "description",
        content:
          "Contagem de estoque de EPI/uniforme com leitor de código de barras, com ajuste pronto para o BuscaEPI.",
      },
    ],
  }),
  component: EstoquePage,
});

type FiltroDivergencia = "todos" | "divergentes" | "sem-leitura" | "ok";
const PAGINA = 80;

function EstoquePage() {
  const { user, role, roleLoading, loading: authLoading, signOut } = useAuth();
  const canWriteStock = !!user && can(role, "estoque.write");
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<"local" | "syncing" | "synced" | "error">("local");
  const [cloudRefresh, setCloudRefresh] = useState(0);
  const cloudReadyRef = useRef(false);
  const cloudSyncErrorRef = useRef(false);
  const cloudGenerationRef = useRef(0);
  const cloudQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [itens, setItens] = useState<EstoqueItem[]>(() => carregarEstoqueItens());
  const [lancamentos, setLancamentos] = useState<EstoqueLancamento[]>(() => carregarLancamentos());
  const itensRef = useRef(itens);
  const lancamentosRef = useRef(lancamentos);

  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState<FiltroDivergencia>("todos");
  const [pagina, setPagina] = useState(1);
  const [historicoOpen, setHistoricoOpen] = useState(false);
  const [backupPreview, setBackupPreview] = useState<{
    itens: EstoqueItem[];
    lancamentos: EstoqueLancamento[];
  } | null>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  // --- fluxo de bipagem em 2 passos: 1) escaneia o código  2) confirma a quantidade ---
  const [codigoInput, setCodigoInput] = useState("");
  const [itemEmConfirmacao, setItemEmConfirmacao] = useState<EstoqueItem | null>(null);
  const [quantidadeInput, setQuantidadeInput] = useState("1");
  const codigoInputRef = useRef<HTMLInputElement>(null);
  const quantidadeInputRef = useRef<HTMLInputElement>(null);

  const [editandoCodigo, setEditandoCodigo] = useState<string | null>(null);
  const [valorEdicao, setValorEdicao] = useState("");

  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  interface ImportPreview {
    novos: number;
    atualizados: number;
    semAlteracao: number;
    warnings: string[];
    resultado: EstoqueItem[];
  }
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);

  const [resetOpen, setResetOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const itensPorCodigo = useMemo(() => new Map(itens.map((it) => [it.codBarras, it])), [itens]);
  const contados = useMemo(() => somarContagemPorCodigo(lancamentos), [lancamentos]);

  const enfileirarNuvem = useCallback((task: () => Promise<void>) => {
    const job = cloudQueueRef.current.then(task);
    cloudQueueRef.current = job.then(
      () => setCloudStatus(cloudSyncErrorRef.current ? "error" : "synced"),
      (error) => {
        cloudSyncErrorRef.current = true;
        console.error("Falha ao sincronizar estoque.", error);
        setCloudStatus("error");
        toast.error(
          "Alteração salva neste dispositivo, mas não sincronizou. Confira conexão e migrations Supabase; use Atualizar dados para reconciliar.",
        );
      },
    );
  }, []);
  const persistirItens = useCallback(
    (lista: EstoqueItem[]) => {
      if (user && !canWriteStock) {
        toast.error(explainDenied("estoque.write"));
        return false;
      }
      if (cloudLoading) {
        toast.info("Aguarde a sincronização inicial terminar.");
        return false;
      }
      const anteriores = new Map(itensRef.current.map((it) => [it.codBarras, it]));
      const codigosMantidos = new Set(lista.map((it) => it.codBarras));
      const itensRemovidos = itensRef.current
        .filter((it) => !codigosMantidos.has(it.codBarras))
        .map((it) => it.codBarras);
      if (user && itensRemovidos.length && !can(role, "estoque.delete")) {
        toast.error(explainDenied("estoque.delete"));
        return false;
      }
      const alterados = lista.filter(
        (it) => JSON.stringify(anteriores.get(it.codBarras)) !== JSON.stringify(it),
      );
      if (!salvarEstoqueItens(lista)) {
        toast.error("O catálogo não pôde ser salvo neste dispositivo.");
        return false;
      }
      itensRef.current = lista;
      setItens(lista);
      void recordOperation({
        module: "ESTOQUE",
        action: itensRemovidos.length ? "UPDATE_AND_DELETE" : "UPDATE_CATALOG",
        entityType: "stock_item",
        result: user && cloudReadyRef.current ? "pending" : "success",
        description: `${alterados.length} item(ns) alterado(s)${itensRemovidos.length ? ` e ${itensRemovidos.length} removido(s)` : ""}.`,
        metadata: { alterados: alterados.length, removidos: itensRemovidos.length },
      });
      if (user && cloudReadyRef.current && (alterados.length || itensRemovidos.length)) {
        const pendentes = { itens: itensRemovidos, lancamentos: [] };
        if (itensRemovidos.length) registrarExclusoesPendentes(pendentes);
        setCloudStatus("syncing");
        enfileirarNuvem(async () => {
          await removerItensEstoqueNuvem(itensRemovidos);
          await gravarItensEstoqueNuvem(alterados);
          limparExclusoesPendentes(pendentes);
        });
      }
      return true;
    },
    [cloudLoading, user, role, canWriteStock, enfileirarNuvem],
  );
  const persistirLancamentos = useCallback(
    (lista: EstoqueLancamento[]) => {
      if (user && !canWriteStock) {
        toast.error(explainDenied("estoque.write"));
        return false;
      }
      if (cloudLoading) {
        toast.info("Aguarde a sincronização inicial terminar.");
        return false;
      }
      const anteriores = lancamentosRef.current;
      const antigos = new Set(anteriores.map((l) => l.id));
      const novos = new Set(lista.map((l) => l.id));
      const adicionados = lista.filter((l) => !antigos.has(l.id));
      const removidos = anteriores.filter((l) => !novos.has(l.id)).map((l) => l.id);
      if (!salvarLancamentos(lista)) {
        toast.error("A contagem não pôde ser salva neste dispositivo.");
        return false;
      }
      lancamentosRef.current = lista;
      setLancamentos(lista);
      void recordOperation({
        module: "ESTOQUE",
        action: "COUNT",
        entityType: "stock_count",
        result: user && cloudReadyRef.current ? "pending" : "success",
        description: `${adicionados.length} lançamento(s) de contagem registrado(s).`,
        metadata: { adicionados: adicionados.length, removidos: removidos.length },
      });
      if (user && cloudReadyRef.current && (adicionados.length || removidos.length)) {
        const pendentes = { itens: [], lancamentos: removidos };
        if (removidos.length) registrarExclusoesPendentes(pendentes);
        setCloudStatus("syncing");
        enfileirarNuvem(async () => {
          await adicionarLancamentosEstoqueNuvem(adicionados, user.id);
          await removerLancamentosEstoqueNuvem(removidos);
          limparExclusoesPendentes(pendentes);
        });
      }
      return true;
    },
    [cloudLoading, user, canWriteStock, enfileirarNuvem],
  );
  useEffect(() => {
    if (authLoading || roleLoading) return;
    if (!isSupabaseConfigured || !user) {
      cloudReadyRef.current = false;
      cloudSyncErrorRef.current = false;
      setCloudLoading(false);
      setCloudStatus("local");
      return;
    }
    const run = ++cloudGenerationRef.current;
    cloudReadyRef.current = false;
    setCloudLoading(true);
    setCloudStatus("syncing");
    void (async () => {
      try {
        const cloud = await carregarEstoqueNuvem();
        if (!canWriteStock) {
          if (run !== cloudGenerationRef.current) return;
          itensRef.current = cloud.itens;
          lancamentosRef.current = cloud.lancamentos;
          setItens(cloud.itens);
          setLancamentos(cloud.lancamentos);
          cloudReadyRef.current = false;
          cloudSyncErrorRef.current = false;
          setCloudStatus("synced");
          return;
        }
        const pendentes = carregarExclusoesPendentes();
        const codigosRemover = new Set(pendentes.itens);
        const idsRemover = new Set(pendentes.lancamentos);
        const eventosRemover = cloud.lancamentos
          .filter((l) => idsRemover.has(l.id) || codigosRemover.has(l.codBarras))
          .map((l) => l.id);
        await removerLancamentosEstoqueNuvem([
          ...new Set([...pendentes.lancamentos, ...eventosRemover]),
        ]);
        await removerItensEstoqueNuvem(pendentes.itens);
        limparExclusoesPendentes(pendentes);
        const itensRemotos = cloud.itens.filter((it) => !codigosRemover.has(it.codBarras));
        const eventosRemotos = cloud.lancamentos.filter(
          (l) => !idsRemover.has(l.id) && !codigosRemover.has(l.codBarras),
        );
        const reconciliacao = reconciliarItensEstoque(itensRef.current, itensRemotos);
        const itensParaEnviar = reconciliacao.paraEnviar;
        const itensMesclados = reconciliacao.itens;
        const eventosLocais = lancamentosRef.current.map((l) => ({
          ...l,
          id: normalizarIdLancamento(l.id),
        }));
        const cloudIds = new Set(eventosRemotos.map((l) => l.id));
        const codigos = new Set(itensMesclados.map((it) => it.codBarras));
        const eventosNovos = eventosLocais.filter(
          (l) => !cloudIds.has(l.id) && codigos.has(l.codBarras),
        );
        const eventosMesclados = [...eventosRemotos, ...eventosNovos].sort(
          (a, b) => a.createdAt - b.createdAt,
        );
        await gravarItensEstoqueNuvem(itensParaEnviar);
        await adicionarLancamentosEstoqueNuvem(eventosNovos, user.id);
        if (run !== cloudGenerationRef.current) return;
        salvarEstoqueItens(itensMesclados);
        salvarLancamentos(eventosMesclados);
        itensRef.current = itensMesclados;
        lancamentosRef.current = eventosMesclados;
        setItens(itensMesclados);
        setLancamentos(eventosMesclados);
        cloudReadyRef.current = true;
        cloudSyncErrorRef.current = false;
        setCloudStatus("synced");
      } catch (error) {
        console.error("Falha ao carregar estoque compartilhado.", error);
        if (run === cloudGenerationRef.current) {
          cloudReadyRef.current = false;
          cloudSyncErrorRef.current = true;
          setCloudStatus("error");
          toast.error(
            "Não foi possível carregar a contagem compartilhada. Verifique migrations e conexão Supabase.",
          );
        }
      } finally {
        if (run === cloudGenerationRef.current) setCloudLoading(false);
      }
    })();
    return () => {
      if (cloudGenerationRef.current === run) cloudGenerationRef.current += 1;
    };
  }, [user, authLoading, roleLoading, canWriteStock, cloudRefresh]);

  useEffect(() => {
    if (!itemEmConfirmacao) codigoInputRef.current?.focus();
  }, [itemEmConfirmacao, itens.length]);

  useEffect(() => {
    if (itemEmConfirmacao) {
      quantidadeInputRef.current?.focus();
      quantidadeInputRef.current?.select();
    }
  }, [itemEmConfirmacao]);

  const stats = useMemo(() => {
    let divergentes = 0;
    let semLeitura = 0;
    let conferidos = 0;
    for (const it of itens) {
      const diff = diferenca(it, contados);
      if (!contados.has(it.codBarras)) semLeitura += 1;
      else if (diff !== 0) divergentes += 1;
      else conferidos += 1;
    }
    return {
      totalItens: itens.length,
      totalLancamentos: lancamentos.length,
      divergentes,
      semLeitura,
      conferidos,
      progresso: itens.length ? Math.round(((itens.length - semLeitura) / itens.length) * 100) : 0,
    };
  }, [itens, contados, lancamentos.length]);

  const aplicarFiltro = useCallback((proximo: FiltroDivergencia) => {
    setFiltro(proximo);
    setSearch("");
    setPagina(1);
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return itens
      .filter((it) => {
        if (term) {
          const alvo = `${it.codBarras} ${it.sku} ${it.item} ${it.cor} ${it.tamanho}`.toLowerCase();
          if (!alvo.includes(term)) return false;
        }
        const diff = diferenca(it, contados);
        if (filtro === "divergentes" && (!contados.has(it.codBarras) || diff === 0)) return false;
        if (filtro === "sem-leitura" && contados.has(it.codBarras)) return false;
        if (filtro === "ok" && (!contados.has(it.codBarras) || diff !== 0)) return false;
        return true;
      })
      .sort((a, b) => {
        const prioridade = (it: EstoqueItem) =>
          !contados.has(it.codBarras) ? 0 : diferenca(it, contados) !== 0 ? 1 : 2;
        return prioridade(a) - prioridade(b) || a.item.localeCompare(b.item, "pt-BR");
      });
  }, [itens, search, filtro, contados]);

  useEffect(() => {
    setPagina(1);
  }, [search, filtro]);
  const totalPaginas = Math.max(1, Math.ceil(filtered.length / PAGINA));
  const itensVisiveis = filtered.slice(
    (Math.min(pagina, totalPaginas) - 1) * PAGINA,
    Math.min(pagina, totalPaginas) * PAGINA,
  );

  // --- Passo 1: usuário bipa (ou digita) o código e aperta Enter ---
  function handleCodigoSubmit() {
    const codigo = codigoInput.trim();
    if (!codigo) return;
    if (!itens.length) {
      toast.error("Importe o catálogo da planilha antes de começar a contar.");
      return;
    }
    const item = itensPorCodigo.get(codigo);
    if (!item) {
      toast.warning(`Código "${codigo}" não encontrado no catálogo importado.`);
      codigoInputRef.current?.select();
      return;
    }
    setItemEmConfirmacao(item);
    setQuantidadeInput("1");
    setCodigoInput("");
  }

  // --- Passo 2: usuário confirma (ou corrige) a quantidade contada daquele item ---
  function handleConfirmarQuantidade() {
    if (!itemEmConfirmacao) return;
    const quantidade = Number(quantidadeInput.replace(",", "."));
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      toast.error("Digite uma quantidade válida (maior que zero).");
      return;
    }
    if (!Number.isSafeInteger(quantidade)) {
      toast.error("A quantidade contada deve ser um número inteiro.");
      return;
    }
    const lancamento = novoLancamento(itemEmConfirmacao.codBarras, quantidade);
    if (!persistirLancamentos([...lancamentos, lancamento])) return;
    toast.success(
      `${itemEmConfirmacao.item}${itemEmConfirmacao.tamanho ? ` (${itemEmConfirmacao.tamanho})` : ""} — +${quantidade} contado(s)`,
      {
        duration: 1800,
      },
    );
    setItemEmConfirmacao(null);
    setQuantidadeInput("1");
  }

  function cancelarConfirmacao() {
    setItemEmConfirmacao(null);
    setQuantidadeInput("1");
  }

  function handleDesfazerUltimaLeitura() {
    if (!lancamentos.length) return;
    const ultimo = lancamentos[lancamentos.length - 1];
    const item = itensPorCodigo.get(ultimo.codBarras);
    if (!persistirLancamentos(lancamentos.slice(0, -1))) return;
    toast.info(`Desfeito: ${item ? item.item : ultimo.codBarras} (${ultimo.quantidade} un.)`);
  }

  // --- edição inline da quantidade contada de um item (corrige sem precisar desfazer tudo) ---
  function iniciarEdicao(it: EstoqueItem) {
    setEditandoCodigo(it.codBarras);
    setValorEdicao(String(contados.get(it.codBarras) ?? 0));
  }

  function confirmarEdicao(it: EstoqueItem) {
    if (!valorEdicao.trim()) {
      toast.error("Informe a quantidade contada.");
      return;
    }
    const novoTotal = Number(valorEdicao.replace(",", "."));
    if (!Number.isFinite(novoTotal) || novoTotal < 0 || !Number.isSafeInteger(novoTotal)) {
      toast.error("Digite um número inteiro válido (0 ou maior).");
      return;
    }
    const totalAtual = contados.get(it.codBarras) ?? 0;
    const delta = novoTotal - totalAtual;
    if (!Number.isSafeInteger(delta)) {
      toast.error("Quantidade fora do limite permitido.");
      return;
    }
    if (delta === 0 && contados.has(it.codBarras)) {
      setEditandoCodigo(null);
      return;
    }
    if (
      !persistirLancamentos([
        ...lancamentos,
        novoLancamento(it.codBarras, delta, delta === 0 ? "conferencia" : "correcao"),
      ])
    )
      return;
    setEditandoCodigo(null);
    toast.success(
      `Contagem de "${it.item}" corrigida para ${novoTotal}, com histórico preservado.`,
    );
  }

  async function handleImportFile(file: File) {
    setImporting(true);
    try {
      const {
        itens: parsed,
        warnings,
        linhasLidas,
        linhasValidas,
      } = await parseEstoqueCatalogoFile(file);
      const { resultado, novos, atualizados, semAlteracao } = mesclarCatalogoImportado(
        itens,
        parsed,
      );
      const avisos = [...warnings];
      if (linhasValidas < linhasLidas) {
        avisos.push(
          `${linhasLidas - linhasValidas} linha(s) do arquivo foram ignoradas (ver avisos acima).`,
        );
      }
      setImportPreview({ novos, atualizados, semAlteracao, warnings: avisos, resultado });
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Erro ao ler a planilha.");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function confirmarImportacao() {
    if (!importPreview) return;
    if (!persistirItens(importPreview.resultado)) return;
    const partes = [
      importPreview.novos ? `${importPreview.novos} novo(s)` : null,
      importPreview.atualizados ? `${importPreview.atualizados} atualizado(s)` : null,
      importPreview.semAlteracao ? `${importPreview.semAlteracao} sem alteração` : null,
    ].filter(Boolean);
    toast.success(
      partes.length
        ? `Estoque atual criado/atualizado — ${partes.join(", ")}`
        : "Nenhuma alteração para gravar",
    );
    setImportPreview(null);
  }

  function handleReiniciarContagem() {
    if (!persistirLancamentos([])) return;
    setResetOpen(false);
    toast.success("Contagem reiniciada — o catálogo (estoque atual) foi mantido.");
  }

  async function handleExportar() {
    if (!itens.length) {
      toast.error("Importe o catálogo antes de exportar.");
      return;
    }
    if (stats.semLeitura)
      toast.warning(
        `${stats.semLeitura} item(ns) pendente(s) não entrarão no ajuste para o BuscaEPI.`,
      );
    setExporting(true);
    try {
      const linhas = itens.map((item) => ({
        item,
        contado: contados.get(item.codBarras) ?? 0,
        conferido: contados.has(item.codBarras),
      }));
      const [{ workbook, nomeArquivo }, XLSX] = await Promise.all([
        gerarWorkbookContagem(linhas),
        loadXlsx(),
      ]);
      const out = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
      saveAs(new Blob([out], { type: "application/octet-stream" }), nomeArquivo);
      const divergentes = linhas.filter(
        (l) => l.conferido && l.contado - l.item.estoqueSistema !== 0,
      ).length;
      toast.success(
        divergentes
          ? `"${nomeArquivo}" gerado — ${divergentes} item(ns) com ajuste pendente.`
          : `"${nomeArquivo}" gerado — nenhuma divergência entre os itens conferidos${stats.semLeitura ? `; ${stats.semLeitura} pendente(s)` : ""}.`,
      );
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível gerar o arquivo de exportação.");
    } finally {
      setExporting(false);
    }
  }

  function marcarZero(it: EstoqueItem) {
    if (contados.has(it.codBarras)) return;
    if (persistirLancamentos([...lancamentos, novoLancamento(it.codBarras, 0, "conferencia")])) {
      toast.success(`"${it.item}" conferido: zero unidades.`);
    }
  }

  function exportarBackup() {
    const backup = createFullLocalBackup(localStorage, user ? "equipe" : "dispositivo");
    saveAs(
      new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
      `backup-contagem-${new Date().toISOString().slice(0, 10)}.json`,
    );
    toast.success("Backup do catálogo e do histórico preparado para download.");
  }

  async function lerBackup(file: File) {
    try {
      if (file.size > 15_000_000) throw new Error("Backup excede o limite de 15 MB.");
      const raw = JSON.parse(await file.text()) as Record<string, unknown>;
      const parsed = raw.tipo === "volga-sst-backup" ? parseBackup(raw) : null;
      const dados = parsed
        ? parsed.dados.estadoLocal
          ? {
              estoque: {
                itens: stateFromBackup(parsed)["volga:estoque-itens:v2"] ?? [],
                lancamentos: stateFromBackup(parsed)["volga:estoque-lancamentos:v2"] ?? [],
              },
            }
          : parsed.dados
        : raw.tipo === "volga-contagem-backup"
          ? raw
          : null;
      const estoque =
        dados && typeof dados === "object" && "estoque" in dados
          ? (dados as { estoque: unknown }).estoque
          : dados;
      const validavel =
        estoque && typeof estoque === "object"
          ? { tipo: "volga-contagem-backup", versao: 1, ...(estoque as Record<string, unknown>) }
          : estoque;
      setBackupPreview(validarBackupContagem(validavel));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ler o backup.");
    } finally {
      if (backupInputRef.current) backupInputRef.current.value = "";
    }
  }

  function restaurarBackup() {
    if (!backupPreview) return;
    if (user && !can(role, "backup.restore")) {
      toast.error(explainDenied("backup.restore"));
      return;
    }
    const itensAnteriores = itensRef.current;
    const eventosAnteriores = lancamentosRef.current;
    // Grava antes de atualizar a tela; se a segunda gravação falhar, restaura o catálogo anterior.
    if (!salvarEstoqueItens(backupPreview.itens)) {
      toast.error("Não foi possível salvar o catálogo restaurado.");
      return;
    }
    if (!salvarLancamentos(backupPreview.lancamentos)) {
      salvarEstoqueItens(itens);
      toast.error("Não foi possível salvar os lançamentos; a restauração foi cancelada.");
      return;
    }
    itensRef.current = backupPreview.itens;
    lancamentosRef.current = backupPreview.lancamentos;
    setItens(backupPreview.itens);
    setLancamentos(backupPreview.lancamentos);
    setBackupPreview(null);
    setItemEmConfirmacao(null);
    setEditandoCodigo(null);
    if (user && cloudReadyRef.current) {
      const idsRemovidos = eventosAnteriores
        .filter(
          (l) => !backupPreview.lancamentos.some((b) => normalizarIdLancamento(b.id) === l.id),
        )
        .map((l) => l.id);
      const codigosRemovidos = itensAnteriores
        .filter((it) => !backupPreview.itens.some((b) => b.codBarras === it.codBarras))
        .map((it) => it.codBarras);
      const pendentes = { itens: codigosRemovidos, lancamentos: idsRemovidos };
      registrarExclusoesPendentes(pendentes);
      setCloudStatus("syncing");
      enfileirarNuvem(async () => {
        await removerLancamentosEstoqueNuvem(idsRemovidos);
        await removerItensEstoqueNuvem(codigosRemovidos);
        await gravarItensEstoqueNuvem(backupPreview.itens);
        await adicionarLancamentosEstoqueNuvem(
          backupPreview.lancamentos.map((l) => ({ ...l, id: normalizarIdLancamento(l.id) })),
          user.id,
        );
        limparExclusoesPendentes(pendentes);
      });
    }
    void recordOperation({
      module: "ESTOQUE",
      action: "RESTORE_BACKUP",
      entityType: "stock_snapshot",
      result: "success",
      description: `Backup restaurado com ${backupPreview.itens.length} item(ns) e ${backupPreview.lancamentos.length} lançamento(s).`,
      metadata: {
        itens: backupPreview.itens.length,
        lancamentos: backupPreview.lancamentos.length,
        compartilhado: !!user,
      },
    });
    toast.success(
      user
        ? "Backup restaurado; sincronizando com a equipe."
        : "Catálogo e histórico restaurados neste dispositivo.",
    );
  }

  return (
    <AppFrame active="/estoque">
      <div className="sst-tool-heading">
        <div>
          <p className="sst-eyebrow">OPERAÇÃO / ESTOQUE</p>
          <h1>Contagem de estoque</h1>
          <p>Confira itens, registre leituras e acompanhe divergências.</p>
        </div>
      </div>

      <main className="sst-main sst-tool-main">
        <Card
          className={`mb-4 flex flex-wrap items-center justify-between gap-2 p-3 text-xs ${user && cloudStatus === "synced" ? "border-accent/40 bg-accent/5" : "border-accent/40 bg-accent/5"}`}
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            {cloudLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : user && cloudStatus === "synced" ? (
              <Cloud className="h-4 w-4" />
            ) : (
              <CloudOff className="h-4 w-4" />
            )}
            {!isSupabaseConfigured
              ? "Configure as variáveis Supabase para habilitar a nuvem."
              : cloudLoading
                ? "Carregando catálogo e histórico compartilhados…"
                : user && cloudStatus === "synced"
                  ? "Nuvem conectada: catálogo e contagem compartilhados com a equipe."
                  : user && cloudStatus === "error"
                    ? "Sincronização indisponível. Dados recentes permanecem neste dispositivo; confira as migrations."
                    : "Modo local: dados neste dispositivo. Entre para sincronizar com a equipe."}
          </div>
          {user && isSupabaseConfigured && !cloudLoading && (
            <Button size="sm" variant="outline" onClick={() => setCloudRefresh((n) => n + 1)}>
              <Cloud className="mr-1.5 h-3.5 w-3.5" />
              {cloudStatus === "error" ? "Tentar novamente" : "Atualizar dados"}
            </Button>
          )}
        </Card>

        <Card className="mb-4 border-accent/30 bg-accent/5 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Progresso da conferência</p>
              <p className="text-xs text-muted-foreground">
                {stats.totalItens - stats.semLeitura} de {stats.totalItens} produtos conferidos ·{" "}
                {stats.progresso}%
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="file"
                accept=".json,application/json"
                className="hidden"
                ref={backupInputRef}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void lerBackup(file);
                }}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!!user && !can(role, "backup.restore")}
                title={
                  user && !can(role, "backup.restore") ? explainDenied("backup.restore") : undefined
                }
                onClick={() => backupInputRef.current?.click()}
              >
                Restaurar backup
              </Button>
              <Button size="sm" variant="outline" onClick={exportarBackup} disabled={!itens.length}>
                <FileDown className="mr-1.5 h-4 w-4" />
                Salvar backup
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setHistoricoOpen(true)}
                disabled={!lancamentos.length}
              >
                <Clock3 className="mr-1.5 h-4 w-4" />
                Histórico
              </Button>
            </div>
          </div>
          <div
            role="progressbar"
            aria-label="Progresso da contagem"
            aria-valuenow={stats.progresso}
            aria-valuemin={0}
            aria-valuemax={100}
            className="mt-3 h-2 overflow-hidden rounded-full bg-border"
          >
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${stats.progresso}%` }}
            />
          </div>
          {stats.semLeitura > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Pendentes não são tratados como falta e não são incluídos no ajuste exportado.
            </p>
          )}
        </Card>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="relative overflow-hidden p-4">
            <div className="absolute inset-x-0 top-0 h-1 bg-border" />
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Package className="h-3.5 w-3.5" /> Itens no catálogo
            </p>
            <p className="mt-1 text-3xl font-bold text-foreground">{stats.totalItens}</p>
          </Card>
          <button type="button" onClick={() => aplicarFiltro("ok")} className="text-left">
            <Card className="relative w-full overflow-hidden p-4 transition-colors hover:bg-accent/5 focus-visible:ring-2 focus-visible:ring-ring">
              <div className="absolute inset-x-0 top-0 h-1 bg-accent" />
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <ScanLine className="h-3.5 w-3.5" /> Conferidos sem diferença
              </p>
              <p className="mt-1 text-3xl font-bold text-accent">{stats.conferidos}</p>
              <p className="mt-1 text-xs text-muted-foreground">Ver itens conferidos</p>
            </Card>
          </button>
          <button type="button" onClick={() => aplicarFiltro("divergentes")} className="text-left">
            <Card className="relative w-full overflow-hidden p-4 transition-colors hover:bg-destructive/5 focus-visible:ring-2 focus-visible:ring-ring">
              <div className="absolute inset-x-0 top-0 h-1 bg-destructive" />
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5" /> Divergências
              </p>
              <p className="mt-1 text-3xl font-bold text-destructive">{stats.divergentes}</p>
              <p className="mt-1 text-xs text-muted-foreground">Revisar agora</p>
            </Card>
          </button>
          <button type="button" onClick={() => aplicarFiltro("sem-leitura")} className="text-left">
            <Card className="relative w-full overflow-hidden p-4 transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring">
              <div className="absolute inset-x-0 top-0 h-1 bg-muted-foreground/40" />
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Search className="h-3.5 w-3.5" /> Pendentes
              </p>
              <p className="mt-1 text-3xl font-bold text-foreground">{stats.semLeitura}</p>
              <p className="mt-1 text-xs text-muted-foreground">Continuar conferência</p>
            </Card>
          </button>
        </div>

        <GraficosContagem itens={itens} lancamentos={lancamentos} />
        <ResultadoContagem
          itens={itens}
          lancamentos={lancamentos}
          onVerDivergentes={() => aplicarFiltro("divergentes")}
        />

        <Card className="mb-4 p-4">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
            <Barcode className="h-4 w-4" /> Leitor de código de barras
          </p>

          {!itemEmConfirmacao ? (
            <div className="flex flex-wrap gap-2">
              <Input
                ref={codigoInputRef}
                className="min-w-[220px] flex-1"
                aria-label="Código de barras para contagem"
                value={codigoInput}
                disabled={!itens.length}
                placeholder={
                  itens.length
                    ? "Clique aqui e bipe o item…"
                    : "Importe o catálogo da planilha primeiro"
                }
                onChange={(e) => setCodigoInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCodigoSubmit();
                  }
                }}
                autoFocus
              />
              <Button onClick={handleCodigoSubmit} disabled={!codigoInput.trim()}>
                <ScanLine className="mr-1.5 h-4 w-4" />
                Localizar
              </Button>
              <Button
                variant="outline"
                onClick={handleDesfazerUltimaLeitura}
                disabled={!lancamentos.length}
                title="Desfazer a última leitura"
              >
                <Undo2 className="mr-1.5 h-4 w-4" />
                Desfazer última
              </Button>
              <Button
                variant="outline"
                onClick={() => setResetOpen(true)}
                disabled={!lancamentos.length}
              >
                <RotateCcw className="mr-1.5 h-4 w-4" />
                Reiniciar contagem
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-accent/40 bg-accent/5 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{itemEmConfirmacao.item}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {itemEmConfirmacao.sku} {itemEmConfirmacao.cor && `· ${itemEmConfirmacao.cor}`}{" "}
                  {itemEmConfirmacao.tamanho && `· ${itemEmConfirmacao.tamanho}`} · estoque sistema:{" "}
                  {itemEmConfirmacao.estoqueSistema}
                </p>
              </div>
              <label htmlFor="quantidade-bipada" className="text-xs font-medium">
                Quantidade a adicionar:
              </label>
              <Input
                ref={quantidadeInputRef}
                id="quantidade-bipada"
                className="w-24"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={quantidadeInput}
                onChange={(e) => setQuantidadeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleConfirmarQuantidade();
                  } else if (e.key === "Escape") {
                    cancelarConfirmacao();
                  }
                }}
              />
              <Button size="sm" onClick={handleConfirmarQuantidade}>
                <Check className="mr-1.5 h-4 w-4" />
                Adicionar
              </Button>
              <Button size="sm" variant="ghost" onClick={cancelarConfirmacao}>
                <X className="mr-1.5 h-4 w-4" />
                Cancelar
              </Button>
            </div>
          )}

          <p className="mt-2 text-xs text-muted-foreground">
            Bipe o item e confirme a quantidade contada (o padrão é 1, mas você pode digitar
            qualquer valor). Cada confirmação SOMA à contagem atual daquele item — para corrigir um
            total, edite direto na tabela abaixo (ícone de lápis).
          </p>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="w-full pl-8 sm:w-64"
                  aria-label="Buscar produtos"
                  placeholder="Buscar por código, SKU, item, cor…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={filtro} onValueChange={(v) => setFiltro(v as FiltroDivergencia)}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os itens</SelectItem>
                  <SelectItem value="divergentes">Só divergentes</SelectItem>
                  <SelectItem value="sem-leitura">Pendentes</SelectItem>
                  <SelectItem value="ok">Conferidos (OK)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImportFile(file);
                }}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={importing}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-1.5 h-4 w-4" />
                {importing ? "Lendo…" : itens.length ? "Atualizar catálogo" : "Importar catálogo"}
              </Button>
              <Button size="sm" disabled={!stats.totalItens || exporting} onClick={handleExportar}>
                <Download className="mr-1.5 h-4 w-4" />
                {exporting ? "Gerando…" : "Exportar contagem"}
              </Button>
            </div>
          </div>

          <div className="border-b px-4 py-2 text-xs text-muted-foreground">
            Exibindo {itensVisiveis.length} de {filtered.length} produto(s) · Pendentes primeiro,
            depois divergências
          </div>
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {stats.totalItens === 0
                ? 'Nenhum catálogo importado ainda. Clique em "Importar catálogo" e selecione o relatório de catálogo exportado do BuscaEPI (.csv).'
                : "Nenhum item encontrado com esse filtro."}
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="sticky top-0 z-10 bg-background">
                    <TableHead>Código</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Cor</TableHead>
                    <TableHead>Tam.</TableHead>
                    <TableHead className="text-right">Sistema</TableHead>
                    <TableHead className="text-right">Contado</TableHead>
                    <TableHead className="text-right">Diferença</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itensVisiveis.map((it) => {
                    const contado = contados.get(it.codBarras) ?? 0;
                    const diff = contado - it.estoqueSistema;
                    const emEdicao = editandoCodigo === it.codBarras;
                    return (
                      <TableRow
                        key={it.codBarras}
                        className={!contados.has(it.codBarras) ? "bg-muted/30" : ""}
                      >
                        <TableCell className="font-mono text-xs">{it.codBarras}</TableCell>
                        <TableCell className="text-xs">{it.sku}</TableCell>
                        <TableCell className="max-w-xs truncate" title={it.item}>
                          {it.item}
                        </TableCell>
                        <TableCell className="text-xs">{it.cor}</TableCell>
                        <TableCell className="text-xs">{it.tamanho}</TableCell>
                        <TableCell className="text-right">{it.estoqueSistema}</TableCell>
                        <TableCell className="text-right">
                          {emEdicao ? (
                            <Input
                              autoFocus
                              className="ml-auto h-7 w-20 text-right"
                              inputMode="numeric"
                              type="number"
                              min="0"
                              step="1"
                              aria-label={`Total contado para ${it.item}`}
                              value={valorEdicao}
                              onChange={(e) => setValorEdicao(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") confirmarEdicao(it);
                                if (e.key === "Escape") setEditandoCodigo(null);
                              }}
                            />
                          ) : contados.has(it.codBarras) ? (
                            contado
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {contados.has(it.codBarras) ? (
                            <DiferencaBadge diff={diff} />
                          ) : (
                            <Badge variant="outline">Pendente</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {emEdicao ? (
                            <div className="flex gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                aria-label={`Salvar correção de ${it.item}`}
                                onClick={() => confirmarEdicao(it)}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                aria-label="Cancelar correção"
                                onClick={() => setEditandoCodigo(null)}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              {!contados.has(it.codBarras) && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 whitespace-nowrap"
                                  onClick={() => marcarZero(it)}
                                >
                                  Conferir 0
                                </Button>
                              )}
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                title="Informar ou corrigir total contado"
                                aria-label={`Informar ou corrigir total de ${it.item}`}
                                onClick={() => iniciarEdicao(it)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {totalPaginas > 1 && (
            <div className="flex items-center justify-between gap-2 border-t p-3 text-sm">
              <span>
                Página {Math.min(pagina, totalPaginas)} de {totalPaginas}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pagina <= 1}
                  onClick={() => setPagina((n) => n - 1)}
                >
                  Anterior
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pagina >= totalPaginas}
                  onClick={() => setPagina((n) => n + 1)}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </Card>
      </main>

      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />
      <Dialog open={!!importPreview} onOpenChange={(open) => !open && setImportPreview(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirmar criação/atualização do estoque atual</DialogTitle>
            <DialogDescription>
              Revise antes de gravar — nada é salvo até você confirmar.
            </DialogDescription>
          </DialogHeader>
          {importPreview && (
            <div className="space-y-2 text-sm">
              <p>
                <strong>{importPreview.novos}</strong> item(ns) novo(s)
              </p>
              <p>
                <strong>{importPreview.atualizados}</strong> item(ns) atualizado(s)
              </p>
              <p className="text-muted-foreground">{importPreview.semAlteracao} sem alteração</p>
              {importPreview.warnings.length > 0 && (
                <div className="max-h-32 overflow-auto rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
                  {importPreview.warnings.map((w, i) => (
                    <p key={i}>{w}</p>
                  ))}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportPreview(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmarImportacao}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!backupPreview} onOpenChange={(open) => !open && setBackupPreview(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restaurar backup?</DialogTitle>
            <DialogDescription>
              Isso substituirá o catálogo e todo o histórico
              {user ? " compartilhado com a equipe" : " neste dispositivo"}. Salve um backup dos
              dados atuais antes de confirmar.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm">
            O arquivo contém {backupPreview?.itens.length ?? 0} produtos e{" "}
            {backupPreview?.lancamentos.length ?? 0} lançamentos. Os dados atuais serão preservados
            apenas no estado da tela durante a operação; exporte um backup antes de confirmar.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBackupPreview(null)}>
              Cancelar
            </Button>
            <Button onClick={restaurarBackup}>Restaurar dados</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={historicoOpen} onOpenChange={setHistoricoOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Histórico de lançamentos</DialogTitle>
            <DialogDescription>
              Últimos 50 registros disponíveis. Correções preservam os lançamentos anteriores.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] space-y-2 overflow-auto" aria-label="Histórico de contagem">
            {lancamentos
              .slice(-50)
              .reverse()
              .map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {itensPorCodigo.get(l.codBarras)?.item ?? l.codBarras}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {l.codBarras} · {new Date(l.createdAt).toLocaleString("pt-BR")} ·{" "}
                      {l.motivo === "correcao"
                        ? "Correção"
                        : l.motivo === "conferencia"
                          ? "Conferência zero"
                          : "Leitura"}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold">
                    {l.quantidade > 0 ? "+" : ""}
                    {l.quantidade}
                  </span>
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reiniciar contagem?</DialogTitle>
            <DialogDescription>
              Isso apaga os lançamentos e o histórico. Com a nuvem conectada, a alteração vale para
              toda a equipe. Salve um backup antes de começar do zero; o catálogo não será afetado.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleReiniciarContagem}>
              Reiniciar contagem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppFrame>
  );
}
