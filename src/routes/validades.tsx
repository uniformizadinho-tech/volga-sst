import { createFileRoute, Link } from "@tanstack/react-router";
import { AppFrame } from "@/components/layout/app-frame";
import { TrainingTabs } from "@/components/treinamentos/training-tabs";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  Search,
  ShieldCheck,
  ArrowUpDown,
  Download,
  FileText,
  X,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import { KpiCard, KpiGrid, ModuleHeader } from "@/components/module/module-kit";
import { HISTORY_EVENT, loadHistory } from "@/lib/history-store";
import {
  AnelConformidade,
  CalendarioReciclagem,
  SituacaoPorNorma,
} from "@/components/painel/graficos-validades";
import {
  buildValidadeRows,
  projetarVencimentos,
  resumirValidades,
  rotuloNr,
  STATUS_LABEL,
  validadesParaCsv,
  type ValidadeRow,
  type ValidadeStatus,
} from "@/lib/validity";
import { JANELAS_ATENCAO, lerJanelaAtencao, salvarJanelaAtencao } from "@/lib/validity-prefs";

const STATUS_VALIDOS: ValidadeStatus[] = ["vencido", "atencao", "ok", "indefinido"];

export const Route = createFileRoute("/validades")({
  validateSearch: (search: Record<string, unknown>): { status?: string; mes?: string } => ({
    status: typeof search.status === "string" ? search.status : undefined,
    // AAAA-MM vindo do calendário de reciclagem da Visão geral
    mes:
      typeof search.mes === "string" && /^\d{4}-\d{2}$/.test(search.mes) ? search.mes : undefined,
  }),
  head: () => ({
    meta: [
      { property: "og:title", content: "Validade dos certificados — Volga SST" },
      {
        property: "og:description",
        content: "Acompanhe vencimentos de treinamentos por colaborador e norma na Volga SST.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },

      { title: "Validade dos Certificados — Volga" },
      {
        name: "description",
        content:
          "Painel de vencimento dos certificados/treinamentos já emitidos, por colaborador e norma.",
      },
    ],
  }),
  component: ValidadesPage,
});

const STATUS_STYLES: Record<
  ValidadeStatus,
  { badge: string; icon: ReactElement; row: string; dot: string }
> = {
  vencido: {
    badge: "bg-destructive/15 text-destructive ring-1 ring-destructive/30",
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    row: "border-l-4 border-l-destructive hover:bg-destructive/[0.04]",
    dot: "bg-destructive",
  },
  atencao: {
    badge: "bg-amber-500/15 text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-400",
    icon: <Clock className="h-3.5 w-3.5" />,
    row: "border-l-4 border-l-amber-500 hover:bg-amber-500/[0.04]",
    dot: "bg-amber-500",
  },
  ok: {
    badge: "bg-accent/15 text-accent ring-1 ring-accent/30 dark:text-accent",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    row: "border-l-4 border-l-emerald-500 hover:bg-accent/[0.04]",
    dot: "bg-accent",
  },
  indefinido: {
    badge: "bg-muted text-muted-foreground ring-1 ring-border",
    icon: <HelpCircle className="h-3.5 w-3.5" />,
    row: "border-l-4 border-l-border",
    dot: "bg-muted-foreground/40",
  },
};

type SortKey = "urgencia" | "nome" | "validade";

const nrLabel = (r: ValidadeRow): string => rotuloNr(r);

function chaveMes(d: Date | null): string | null {
  return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : null;
}

function rotuloMes(chave: string): string {
  const [a, m] = chave.split("-").map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("pt-BR");
}

function formatDias(dias: number | null): string {
  if (dias === null) return "—";
  if (dias < 0) return `Vencido há ${Math.abs(dias)} dia${Math.abs(dias) === 1 ? "" : "s"}`;
  if (dias === 0) return "Vence hoje";
  return `Faltam ${dias} dia${dias === 1 ? "" : "s"}`;
}

/** Barra de urgência: cheia e vermelha quando vencido, esvaziando conforme o prazo é maior. */
function UrgencyBar({ row }: { row: ValidadeRow }) {
  if (row.status === "indefinido" || row.diasRestantes === null) {
    return <div className="h-1.5 w-full rounded-full bg-muted" />;
  }
  const dias = row.diasRestantes;
  const pct = dias < 0 ? 100 : Math.max(4, 100 - (Math.min(dias, 90) / 90) * 100);
  const color =
    row.status === "vencido"
      ? "bg-destructive"
      : row.status === "atencao"
        ? "bg-amber-500"
        : "bg-accent";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full transition-all", color)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function ValidadesPage() {
  const [history, setHistory] = useState(() => loadHistory());
  const [janela, setJanela] = useState<number>(30);
  useEffect(() => {
    setJanela(lerJanelaAtencao());
  }, []);
  useEffect(() => {
    const refresh = () => setHistory(loadHistory());
    window.addEventListener("storage", refresh);
    window.addEventListener(HISTORY_EVENT, refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(HISTORY_EVENT, refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  const rows = useMemo(
    () => buildValidadeRows(history, new Date(), { janelaAtencaoDias: janela }),
    [history, janela],
  );
  const resumo = useMemo(() => resumirValidades(rows), [rows]);
  const projecao = useMemo(() => projetarVencimentos(rows, new Date(), 12), [rows]);
  const { status: statusInicial, mes: mesInicial } = Route.useSearch();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | ValidadeStatus>("todos");
  const [normaFilter, setNormaFilter] = useState<string>("todas");
  const [sortKey, setSortKey] = useState<SortKey>("urgencia");
  const [mesFilter, setMesFilter] = useState<string | null>(null);

  // Vem da tela inicial (ex.: /validades?status=vencido)
  useEffect(() => {
    if (statusInicial && (STATUS_VALIDOS as string[]).includes(statusInicial)) {
      setStatusFilter(statusInicial as ValidadeStatus);
    }
  }, [statusInicial]);
  useEffect(() => {
    if (mesInicial) setMesFilter(mesInicial);
  }, [mesInicial]);

  const normasDisponiveis = useMemo(() => {
    const set = new Set(rows.map(nrLabel));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (statusFilter !== "todos" && r.status !== statusFilter) return false;
      if (normaFilter !== "todas" && nrLabel(r) !== normaFilter) return false;
      // Mês do calendário: o que vence naquele mês e ainda não venceu (vencidos têm filtro próprio).
      if (mesFilter && (r.status === "vencido" || chaveMes(r.dataValidade) !== mesFilter))
        return false;
      if (!q) return true;
      return (
        r.nome.toLowerCase().includes(q) ||
        r.cpf.toLowerCase().includes(q) ||
        r.treinamento.toLowerCase().includes(q)
      );
    });
    const sorted = [...list];
    if (sortKey === "nome") {
      sorted.sort((a, b) => a.nome.localeCompare(b.nome));
    } else if (sortKey === "validade") {
      sorted.sort((a, b) => {
        if (!a.dataValidade && !b.dataValidade) return 0;
        if (!a.dataValidade) return 1;
        if (!b.dataValidade) return -1;
        return a.dataValidade.getTime() - b.dataValidade.getTime();
      });
    }
    // "urgencia" já vem ordenado de buildValidadeRows
    return sorted;
  }, [rows, search, statusFilter, normaFilter, sortKey, mesFilter]);

  const filtrosAtivos =
    statusFilter !== "todos" ||
    normaFilter !== "todas" ||
    search.trim() !== "" ||
    mesFilter !== null;
  const alternarStatus = (s: ValidadeStatus) =>
    setStatusFilter((atual) => (atual === s ? "todos" : s));
  const pendentesNaLista = filtered.filter(
    (r) => r.status === "vencido" || r.status === "atencao",
  ).length;

  function exportarPendencias() {
    const csv = validadesParaCsv(filtered);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `reciclagens-pendentes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const stats = useMemo(
    () => ({
      total: rows.length,
      vencido: rows.filter((r) => r.status === "vencido").length,
      atencao: rows.filter((r) => r.status === "atencao").length,
      ok: rows.filter((r) => r.status === "ok").length,
      indefinido: rows.filter((r) => r.status === "indefinido").length,
    }),
    [rows],
  );

  return (
    <AppFrame active="/treinamentos">
      <ModuleHeader
        code="MOD-TRN"
        group="Pessoas e saúde · Treinamentos"
        title="Validades e reciclagem"
        description="Vencimentos dos certificados emitidos, por colaborador e treinamento."
      />
      <TrainingTabs current="validades" />

      <main className="sst-main sst-tool-main">
        <KpiGrid>
          <KpiCard
            label="Conformidade"
            tone={stats.total && stats.ok / stats.total >= 0.95 ? "ok" : "warn"}
            icon={<CheckCircle2 />}
            value={`${stats.total ? Math.round((stats.ok / stats.total) * 100) : 0}%`}
            progress={stats.total ? (stats.ok / stats.total) * 100 : 0}
            hint={`${stats.ok} de ${stats.total} em dia · meta 95%`}
            active={statusFilter === "ok"}
            onClick={() => alternarStatus("ok")}
          />
          <KpiCard
            label="Vencidos"
            tone="crit"
            icon={<AlertTriangle />}
            value={stats.vencido}
            hint={
              statusFilter === "vencido"
                ? "Filtro ativo · clique para limpar"
                : stats.vencido
                  ? "Regularizar imediatamente"
                  : "Nenhum vencido"
            }
            active={statusFilter === "vencido"}
            onClick={() => alternarStatus("vencido")}
          />
          <KpiCard
            label={`Vencem em ${janela} dias`}
            tone="warn"
            icon={<Clock />}
            value={stats.atencao}
            hint={
              statusFilter === "atencao"
                ? "Filtro ativo · clique para limpar"
                : stats.atencao
                  ? "Agendar turma de reciclagem"
                  : "Sem vencimentos próximos"
            }
            active={statusFilter === "atencao"}
            onClick={() => alternarStatus("atencao")}
          />
          <KpiCard
            label="Sem prazo definido"
            tone="neutral"
            icon={<HelpCircle />}
            value={stats.indefinido}
            hint={stats.indefinido ? "Definir validade no modelo" : "Todos com prazo"}
            active={statusFilter === "indefinido"}
            onClick={() => alternarStatus("indefinido")}
          />
        </KpiGrid>

        {stats.total > 0 && (
          <div className="mb-5 grid gap-4 lg:grid-cols-3">
            <AnelConformidade resumo={resumo} onSelecionar={(st) => alternarStatus(st)} />
            <CalendarioReciclagem
              className="lg:col-span-2"
              projecao={projecao}
              mesAtivo={mesFilter}
              onSelecionarMes={setMesFilter}
            />
            <SituacaoPorNorma
              className="lg:col-span-3"
              porNr={resumo.porNr}
              ativo={normaFilter}
              onSelecionar={(nr) => setNormaFilter(normaFilter === nr ? "todas" : nr)}
              limite={10}
            />
          </div>
        )}

        <Card className="overflow-hidden">
          <div
            className="flex flex-wrap items-center gap-2 border-b border-border p-3"
            role="search"
            aria-label="Filtros de validade"
          >
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, CPF ou treinamento..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
            >
              <SelectTrigger className="w-44" aria-label="Filtrar por status de validade">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="vencido">Vencido</SelectItem>
                <SelectItem value="atencao">Vence em breve</SelectItem>
                <SelectItem value="ok">Em dia</SelectItem>
                <SelectItem value="indefinido">Sem prazo definido</SelectItem>
              </SelectContent>
            </Select>
            <Select value={normaFilter} onValueChange={setNormaFilter}>
              <SelectTrigger className="w-56" aria-label="Filtrar por norma regulamentadora">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as NRs</SelectItem>
                {normasDisponiveis.map((n) => (
                  <SelectItem key={n} value={n}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={String(janela)}
              onValueChange={(v) => {
                setJanela(Number(v));
                salvarJanelaAtencao(Number(v));
              }}
            >
              <SelectTrigger
                className="w-44"
                aria-label="Definir antecedência do alerta de vencimento"
                title="Antecedência do alerta de vencimento"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {JANELAS_ATENCAO.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    Alertar {d} dias antes
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {mesFilter && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium capitalize text-primary">
                Vencem em {rotuloMes(mesFilter)}
                <button
                  type="button"
                  aria-label="Remover filtro de mês"
                  onClick={() => setMesFilter(null)}
                  className="rounded-full p-0.5 hover:bg-primary/15"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {filtrosAtivos && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="gap-1.5"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("todos");
                  setNormaFilter("todas");
                  setMesFilter(null);
                }}
              >
                <X className="h-3.5 w-3.5" /> Limpar filtros
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={pendentesNaLista === 0}
              onClick={exportarPendencias}
              title="Baixa a lista de vencidos e a vencer (respeita os filtros) em CSV para Excel"
            >
              <Download className="h-3.5 w-3.5" />
              Exportar pendências ({pendentesNaLista})
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() =>
                setSortKey((k) =>
                  k === "urgencia" ? "nome" : k === "nome" ? "validade" : "urgencia",
                )
              }
              title="Alternar ordenação"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              {sortKey === "urgencia"
                ? "Mais urgente"
                : sortKey === "nome"
                  ? "Nome (A-Z)"
                  : "Data de validade"}
            </Button>
          </div>

          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-14 text-center text-sm text-muted-foreground">
              <ShieldCheck className="h-8 w-8 opacity-40" />
              <p>Nenhum certificado no histórico ainda.</p>
              <p className="text-xs">
                Gere certificados com validade informada para eles aparecerem aqui.
              </p>
              <Button asChild size="sm" className="mt-2 gap-1.5">
                <Link to="/certificados">
                  <FileText className="h-3.5 w-3.5" /> Gerar o primeiro certificado
                </Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead>Treinamento</TableHead>
                  <TableHead>Emissão</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead className="w-40">Urgência</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      Nenhum registro encontrado com esse filtro.
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((r) => (
                  <TableRow
                    key={r.key}
                    className={cn("transition-colors", STATUS_STYLES[r.status].row)}
                  >
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        <span
                          className={cn("h-1.5 w-1.5 rounded-full", STATUS_STYLES[r.status].dot)}
                        />
                        {r.nome}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.cpf || "—"}</TableCell>
                    <TableCell className="max-w-[280px] text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-foreground">
                          {nrLabel(r)}
                        </span>
                        <span className="truncate" title={r.treinamento}>
                          {r.treinamento || r.normaRef}
                        </span>
                      </div>
                      {r.emissoes > 1 && (
                        <div className="mt-0.5 text-[11px]">
                          Reciclado · {r.emissoes} emissões no histórico
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(r.dataEmissao)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <div>{formatDate(r.dataValidade)}</div>
                      <div className="text-xs">{formatDias(r.diasRestantes)}</div>
                    </TableCell>
                    <TableCell>
                      <UrgencyBar row={r} />
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                          STATUS_STYLES[r.status].badge,
                        )}
                      >
                        {STATUS_STYLES[r.status].icon}
                        {STATUS_LABEL[r.status]}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Calculado a partir do histórico de certificados gerados neste dispositivo. A reciclagem
          substitui o curso inicial da mesma trilha (ex.: NR-10 Básico → NR-10 Básico Reciclagem) e
          a conformidade considera só treinamentos com prazo definido. Ajuste a "Validade do
          treinamento (meses)" em Dados do Treinamento, na tela de certificados, para cada norma
          refletir a periodicidade real da sua empresa.
        </p>
      </main>
    </AppFrame>
  );
}
