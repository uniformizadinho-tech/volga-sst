import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRight, CheckCircle2, RefreshCw } from "lucide-react";

import { AppFrame } from "@/components/layout/app-frame";
import { InspectionOverview, TrainingQueue } from "@/components/painel/operational-details";
import { TrainingEvidenceOverview } from "@/components/painel/training-evidence-overview";
import { loadDB, type InspecoesDB } from "@/lib/inspecoes";
import { resumirInspecoesPainel } from "@/lib/inspecoes-dashboard";
import { loadTrainingState, type TrainingSnapshot } from "@/lib/training-store";
import { resumirMatrizTreinamentos } from "@/lib/training-matrix";
import { useAuth } from "@/hooks/use-auth";
import { AnelConformidade, CalendarioReciclagem } from "@/components/painel/graficos-validades";
import { OcupacaoVestiarioChart } from "@/components/painel/graficos-armarios";
import { formatarHoras, RitmoContagemChart } from "@/components/painel/graficos-estoque";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { loadHistory } from "@/lib/history-store";
import { loadLockersCache, loadLockersCloud, saveLockersCache } from "@/lib/lockers-store";
import {
  carregarEstoqueItens,
  carregarLancamentos,
  salvarEstoqueItens,
  salvarLancamentos,
} from "@/lib/estoque-store";
import { carregarEstoqueNuvem } from "@/lib/estoque-cloud";
import { pullSharedState } from "@/lib/shared-kv";
import { lerJanelaAtencao } from "@/lib/validity-prefs";
import { montarPainelGeral, type PainelGeral } from "@/lib/painel-geral";
import type { ValidadeRow } from "@/lib/validity";
import {
  contarFrentesComAcao,
  montarPendenciaInspecoes,
  ordenarPendencias,
  type Severidade,
} from "@/lib/pendencias";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Visão geral — Volga SST" },
      {
        name: "description",
        content:
          "Painel operacional de SST da Volga: fila de ações, vencimentos, inspeções, armários e estoque.",
      },
      { property: "og:title", content: "Visão geral — Volga SST" },
      {
        property: "og:description",
        content: "Fila de ações e indicadores operacionais de SST da Volga em uma única tela.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MenuPage,
});

type Tom = "ok" | "warn" | "crit" | "neutral";

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const num = (n: number) => n.toLocaleString("pt-BR");

const SEVERIDADE: Record<Severidade, { rotulo: string; tom: Tom }> = {
  critica: { rotulo: "Crítico", tom: "crit" },
  atencao: { rotulo: "Atenção", tom: "warn" },
  info: { rotulo: "Info", tom: "neutral" },
};

const AREA: Record<string, string> = {
  certificados: "Validades",
  estoque: "Estoque",
  armarios: "Armários",
  inspecoes: "Inspeções",
  matriz: "Treinamentos",
};

function lerPainel(): PainelGeral {
  return montarPainelGeral({
    historico: loadHistory(),
    janelaDias: lerJanelaAtencao(),
    armarios: loadLockersCache(),
    estoqueItens: carregarEstoqueItens(),
    lancamentos: carregarLancamentos(),
  });
}

function prazoCurto(r: ValidadeRow): string {
  const d = r.diasRestantes ?? 0;
  if (d === 0) return "hoje";
  if (d === 1) return "amanhã";
  return `${d} dias`;
}

/** Célula da régua de métricas: rótulo, número tabular, contexto e barra semafórica. */
function Metrica({
  to,
  search,
  rotulo,
  valor,
  nota,
  tom,
  pct,
}: {
  to: "/validades" | "/inspecoes" | "/armarios" | "/estoque";
  search?: Record<string, string>;
  rotulo: string;
  valor: ReactNode;
  nota: ReactNode;
  tom: Tom;
  pct?: number | null;
}) {
  return (
    <Link to={to} search={search as never} className="sst-tw-metric" data-tone={tom}>
      <span className="sst-tw-metric-label">
        <i aria-hidden />
        {rotulo}
      </span>
      <strong className="sst-tw-metric-value">{valor}</strong>
      <span className="sst-tw-metric-note">{nota}</span>
      {pct !== undefined && pct !== null && (
        <span className="sst-tw-metric-bar" aria-hidden>
          <span style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
        </span>
      )}
    </Link>
  );
}

function Painel({
  titulo,
  extra,
  children,
  className,
}: {
  titulo: string;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("sst-tw-panel", className)} aria-label={titulo}>
      <header className="sst-tw-panel-head">
        <h2>{titulo}</h2>
        {extra}
      </header>
      {children}
    </section>
  );
}

function MenuPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const agora = new Date();
  const [painel, setPainel] = useState<PainelGeral | null>(null);
  const [inspecoes, setInspecoes] = useState<InspecoesDB>({ equipamentos: [], inspecoes: [] });
  const [trainingSnapshot, setTrainingSnapshot] = useState<TrainingSnapshot | null>(null);
  const [trainingLoading, setTrainingLoading] = useState(true);
  const [trainingError, setTrainingError] = useState("");
  const [indicador, setIndicador] = useState<"treinamentos" | "armarios" | "estoque">(
    "treinamentos",
  );
  const trainingRequest = useRef(0);
  const dashboardRequest = useRef(0);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState("");
  const refreshTraining = useCallback(() => {
    const requestId = ++trainingRequest.current;
    setTrainingLoading(true);
    setTrainingError("");
    void loadTrainingState()
      .then((snapshot) => {
        if (trainingRequest.current === requestId) setTrainingSnapshot(snapshot);
      })
      .catch((cause) => {
        if (trainingRequest.current === requestId) {
          setTrainingError(
            cause instanceof Error ? cause.message : "Não foi possível carregar a Matriz.",
          );
        }
      })
      .finally(() => {
        if (trainingRequest.current === requestId) setTrainingLoading(false);
      });
  }, []);
  const atualizar = useCallback(async () => {
    const requestId = ++dashboardRequest.current;
    setDashboardLoading(true);
    setDashboardError("");
    setPainel((current) => current ?? lerPainel());
    setInspecoes(loadDB());
    refreshTraining();

    const [sharedResult, lockersResult, stockResult] = await Promise.allSettled([
      pullSharedState(),
      loadLockersCloud(),
      carregarEstoqueNuvem(),
    ]);
    if (dashboardRequest.current !== requestId) return;

    const avisos: string[] = [];
    if (sharedResult.status === "rejected" || !sharedResult.value) {
      avisos.push("histórico e inspeções");
    }

    let armarios = loadLockersCache();
    if (lockersResult.status === "fulfilled") {
      armarios = lockersResult.value;
      saveLockersCache(armarios);
    } else {
      avisos.push("armários");
    }

    let estoqueItens = carregarEstoqueItens();
    let lancamentos = carregarLancamentos();
    if (stockResult.status === "fulfilled") {
      estoqueItens = stockResult.value.itens;
      lancamentos = stockResult.value.lancamentos;
      salvarEstoqueItens(estoqueItens);
      salvarLancamentos(lancamentos);
    } else {
      avisos.push("estoque");
    }

    setPainel(
      montarPainelGeral({
        historico: loadHistory(),
        janelaDias: lerJanelaAtencao(),
        armarios,
        estoqueItens,
        lancamentos,
        hoje: new Date(),
      }),
    );
    setInspecoes(loadDB());
    setDashboardError(avisos.length ? `Falha ao atualizar: ${avisos.join(", ")}.` : "");
    setDashboardLoading(false);
  }, [refreshTraining]);

  // Recalcula ao voltar para a aba e quando outra aba altera os dados (ex.: contagem em andamento).
  useEffect(() => {
    void atualizar();
    const onStorage = () => void atualizar();
    const onVisivel = () => {
      if (document.visibilityState === "visible") void atualizar();
    };
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisivel);
    return () => {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisivel);
      trainingRequest.current += 1;
      dashboardRequest.current += 1;
    };
  }, [atualizar]);

  const v = painel?.validades.resumo;
  const vencidos = v?.porStatus.vencido ?? 0;
  const atencao = v?.porStatus.atencao ?? 0;
  const arm = painel?.armarios.stats;
  const est = painel?.estoque;
  const resumoInspecoes = resumirInspecoesPainel(
    inspecoes,
    new Date(painel?.geradoEm ?? agora.getTime()),
  );
  const resumoMatriz = useMemo(
    () => (trainingSnapshot ? resumirMatrizTreinamentos(trainingSnapshot.state) : null),
    [trainingSnapshot],
  );
  const pendenciaInspecoes = montarPendenciaInspecoes(resumoInspecoes);
  const pendenciasDashboard = painel
    ? ordenarPendencias([...painel.pendencias, ...(pendenciaInspecoes ? [pendenciaInspecoes] : [])])
    : [];
  const frentes = contarFrentesComAcao(pendenciasDashboard, resumoMatriz?.emAberto ?? 0);

  // Fila única: pendências calculadas + Matriz documental (fonte separada, mesma prioridade "atenção").
  const fila = [
    ...pendenciasDashboard.map((p) => ({
      id: p.id,
      severidade: p.severidade,
      area: AREA[p.area],
      titulo: p.titulo,
      detalhe: p.detalhe,
      acao: p.acao,
      to: p.to as string,
      search: p.search,
    })),
    ...(resumoMatriz && resumoMatriz.emAberto > 0
      ? [
          {
            id: "matriz-aberto",
            severidade: "atencao" as Severidade,
            area: AREA.matriz,
            titulo: `${plural(resumoMatriz.emAberto, "item da Matriz", "itens da Matriz")} em aberto`,
            detalhe: "Declaração sem prova, necessidade de treinamento ou dados a revisar.",
            acao: "Revisar Matriz",
            to: "/treinamentos",
            search: undefined,
          },
        ]
      : []),
  ].sort(
    (a, b) =>
      ({ critica: 0, atencao: 1, info: 2 })[a.severidade] -
      { critica: 0, atencao: 1, info: 2 }[b.severidade],
  );

  const criticas = fila.filter((f) => f.severidade === "critica").length;
  const emAtencao = fila.filter((f) => f.severidade === "atencao").length;
  const estadoGeral: Tom = !painel ? "neutral" : criticas ? "crit" : emAtencao ? "warn" : "ok";

  const tomInspecoes: Tom = !resumoInspecoes.ativos
    ? "neutral"
    : resumoInspecoes.criticas || resumoInspecoes.vencidos
      ? "crit"
      : resumoInspecoes.pendentes
        ? "warn"
        : "ok";
  const tomEstoque: Tom = !est?.resumo.totalItens
    ? "neutral"
    : est.resumo.itensComFalta
      ? "crit"
      : est.resumo.pendentes
        ? "warn"
        : "ok";
  const proximosMeses = painel?.validades.projecao.meses.slice(0, 6) ?? [];
  const maxMes = Math.max(1, ...proximosMeses.map((m) => m.vencem));

  return (
    <AppFrame active="/" userEmail={user?.email}>
      <main className="sst-main sst-tw">
        <header className="sst-tw-head">
          <div>
            <h1>Visão geral</h1>
            <p>
              {new Intl.DateTimeFormat("pt-BR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              }).format(agora)}
            </p>
          </div>
          <div className="sst-tw-head-actions">
            <span className="sst-tw-state" data-tone={estadoGeral} role="status">
              <i aria-hidden />
              {!painel
                ? "Carregando"
                : criticas
                  ? `${plural(criticas, "item crítico", "itens críticos")} · ${plural(frentes, "frente", "frentes")} com ação`
                  : frentes
                    ? `${plural(frentes, "frente", "frentes")} com ação`
                    : "Operação em ordem"}
            </span>
            <span
              className={cn("sst-tw-sync", dashboardError && "is-stale")}
              title={dashboardError || undefined}
            >
              {dashboardLoading
                ? "Sincronizando…"
                : dashboardError
                  ? "Dados parciais"
                  : painel
                    ? `Atualizado ${new Date(painel.geradoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                    : ""}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={dashboardLoading}
              onClick={() => void atualizar()}
              aria-label="Atualizar dados"
              title="Atualizar dados"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", dashboardLoading && "animate-spin")} />
            </Button>
          </div>
        </header>

        <nav className="sst-tw-metrics" aria-label="Indicadores da operação">
          <Metrica
            to="/validades"
            rotulo="Conformidade"
            tom={!v?.total ? "neutral" : vencidos ? "crit" : atencao ? "warn" : "ok"}
            valor={v?.conformidadePct != null ? `${v.conformidadePct}%` : "—"}
            nota={
              v?.total ? `${num(v.total)} treinamentos acompanhados` : "Sem certificados emitidos"
            }
            pct={v?.conformidadePct}
          />
          <Metrica
            to="/validades"
            search={{ status: "vencido" }}
            rotulo="Vencidos"
            tom={vencidos ? "crit" : v?.total ? "ok" : "neutral"}
            valor={v?.total ? num(vencidos) : "—"}
            nota={
              vencidos
                ? plural(
                    v?.pessoasComVencido ?? 0,
                    "colaborador sem habilitação",
                    "colaboradores sem habilitação",
                  )
                : "Nenhum vencido"
            }
          />
          <Metrica
            to="/validades"
            search={{ status: "atencao" }}
            rotulo={`Vencem em ${painel?.janelaDias ?? 30}d`}
            tom={atencao ? "warn" : v?.total ? "ok" : "neutral"}
            valor={v?.total ? num(atencao) : "—"}
            nota={
              atencao
                ? "Agendar reciclagem"
                : painel?.validades.projecao.pico
                  ? `Pico: ${painel.validades.projecao.pico.rotulo}`
                  : "Sem prazos próximos"
            }
          />
          <Metrica
            to="/inspecoes"
            rotulo="Inspeções no mês"
            tom={tomInspecoes}
            valor={
              resumoInspecoes.ativos ? (
                <>
                  {num(resumoInspecoes.feitos)}
                  <small>/{num(resumoInspecoes.ativos)}</small>
                </>
              ) : (
                "—"
              )
            }
            nota={
              !resumoInspecoes.ativos
                ? "Sem equipamentos"
                : resumoInspecoes.vencidos
                  ? plural(resumoInspecoes.vencidos, "equipamento vencido", "equipamentos vencidos")
                  : `${num(resumoInspecoes.pendentes)} a inspecionar`
            }
            pct={resumoInspecoes.ativos ? resumoInspecoes.cobertura : null}
          />
          <Metrica
            to="/armarios"
            rotulo="Armários livres"
            tom={
              !arm?.total
                ? "neutral"
                : arm.livres === 0
                  ? "crit"
                  : arm.ocupacaoPct >= 95
                    ? "warn"
                    : "ok"
            }
            valor={
              arm?.total ? (
                <>
                  {num(arm.livres)}
                  <small>/{num(arm.total)}</small>
                </>
              ) : (
                "—"
              )
            }
            nota={arm?.total ? `${arm.ocupacaoPct}% ocupados` : "Sem armários"}
            pct={arm?.total ? arm.ocupacaoPct : null}
          />
          <Metrica
            to="/estoque"
            rotulo="Contagem de estoque"
            tom={tomEstoque}
            valor={
              est?.resumo.totalItens
                ? `${(est.iniciada ? est.resumo.coberturaPct : 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
                : "—"
            }
            nota={
              !est?.resumo.totalItens
                ? "Catálogo não importado"
                : !est.iniciada
                  ? `${num(est.resumo.totalItens)} itens a contar`
                  : est.resumo.pendentes === 0
                    ? `Concluída · acurácia ${est.resumo.acuraciaPct ?? 0}%`
                    : est.resumo.valorFalta
                      ? `Falta ${brl(est.resumo.valorFalta)}`
                      : `${num(est.resumo.pendentes)} itens restantes · ${formatarHoras(est.ritmo.horasRestantes)}`
            }
            pct={est?.resumo.totalItens ? (est.iniciada ? est.resumo.coberturaPct : 0) : null}
          />
        </nav>

        <div className="sst-tw-grid">
          <Painel
            titulo="Fila de ação"
            extra={
              painel && fila.length > 0 ? (
                <span className="sst-tw-counts">
                  {criticas > 0 && (
                    <b data-tone="crit">
                      {criticas} crítico{criticas === 1 ? "" : "s"}
                    </b>
                  )}
                  {emAtencao > 0 && <b data-tone="warn">{emAtencao} atenção</b>}
                </span>
              ) : null
            }
          >
            {!painel ? (
              <div className="sst-tw-skeleton" aria-hidden />
            ) : fila.length === 0 ? (
              <p className="sst-tw-empty">
                <CheckCircle2 size={16} />
                {trainingLoading
                  ? "Conferindo a Matriz de treinamentos…"
                  : "Nenhuma ação pendente nas fontes carregadas."}
              </p>
            ) : (
              <ol className="sst-tw-queue">
                {fila.map((f) => (
                  <li key={f.id} data-tone={SEVERIDADE[f.severidade].tom}>
                    <span className="sst-tw-sev">{SEVERIDADE[f.severidade].rotulo}</span>
                    <span className="sst-tw-area">{f.area}</span>
                    <span className="sst-tw-item">
                      <strong>{f.titulo}</strong>
                      <span>{f.detalhe}</span>
                    </span>
                    <Link
                      to={f.to as "/validades"}
                      search={f.search as never}
                      className="sst-tw-action"
                    >
                      {f.acao}
                      <ArrowRight size={14} />
                    </Link>
                  </li>
                ))}
              </ol>
            )}
            {trainingError && (
              <p className="sst-tw-foot">Matriz de treinamentos indisponível · fila parcial.</p>
            )}
          </Painel>

          <div className="sst-tw-side">
            <Painel
              titulo="Próximos vencimentos"
              extra={
                <Link to="/validades" className="sst-tw-link">
                  Ver todos
                </Link>
              }
            >
              {!painel ? (
                <div className="sst-tw-skeleton is-short" aria-hidden />
              ) : painel.validades.proximos.length === 0 ? (
                <p className="sst-tw-empty">
                  {painel.validades.rows.length === 0
                    ? "Nenhum certificado emitido com validade ainda."
                    : "Nenhum vencimento futuro com prazo definido."}
                </p>
              ) : (
                <ul className="sst-tw-due">
                  {painel.validades.proximos.map((r) => (
                    <li key={r.key} data-tone={r.status === "atencao" ? "warn" : "neutral"}>
                      <span className="sst-tw-due-who">
                        <strong>{r.nome}</strong>
                        <span>
                          {r.nrCode ? `NR-${r.nrCode}` : "Outros"} · {r.treinamento || r.normaRef}
                        </span>
                      </span>
                      <span className="sst-tw-due-when">
                        {prazoCurto(r)}
                        <small>{r.dataValidade?.toLocaleDateString("pt-BR")}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Painel>

            <Painel titulo="Reciclagens · próximos 6 meses">
              {proximosMeses.length === 0 || proximosMeses.every((m) => m.vencem === 0) ? (
                <p className="sst-tw-empty">Sem vencimentos projetados no período.</p>
              ) : (
                <ul className="sst-tw-months">
                  {proximosMeses.map((m) => (
                    <li key={m.chave}>
                      <button
                        type="button"
                        onClick={() => navigate({ to: "/validades", search: { mes: m.chave } })}
                        title={
                          m.principaisNrs.length
                            ? m.principaisNrs.map((n) => `${n.nr} (${n.qtd})`).join(", ")
                            : undefined
                        }
                      >
                        <span className="sst-tw-month-label">{m.rotulo}</span>
                        <span className="sst-tw-month-bar">
                          <span style={{ width: `${(m.vencem / maxMes) * 100}%` }} />
                        </span>
                        <span className="sst-tw-month-value">{m.vencem}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Painel>
          </div>
        </div>

        <details className="sst-advanced">
          <summary>
            Indicadores detalhados <span>Abrir</span>
            <ArrowRight size={17} />
          </summary>
          {painel && (
            <div className="sst-dashboard-details">
              <TrainingQueue painel={painel} />
              <InspectionOverview db={inspecoes} hoje={new Date(painel.geradoEm)} />
            </div>
          )}

          <TrainingEvidenceOverview
            summary={resumoMatriz}
            loading={trainingLoading}
            error={trainingError}
            onRetry={refreshTraining}
          />

          {painel && (
            <section className="sst-home-section mt-8" aria-labelledby="charts-heading">
              <div className="sst-home-section-title">
                <div>
                  <h2 id="charts-heading">Planejamento da operação</h2>
                </div>
                <div
                  className="sst-dashboard-tabs"
                  role="group"
                  aria-label="Indicadores por módulo"
                >
                  {(["treinamentos", "armarios", "estoque"] as const).map((item) => (
                    <Button
                      key={item}
                      size="sm"
                      variant="ghost"
                      aria-pressed={indicador === item}
                      onClick={() => setIndicador(item)}
                    >
                      {item === "treinamentos"
                        ? "Validades"
                        : item === "armarios"
                          ? "Armários"
                          : "Estoque"}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                {indicador === "treinamentos" && (
                  <>
                    <AnelConformidade
                      resumo={painel.validades.resumo}
                      onSelecionar={(status) => navigate({ to: "/validades", search: { status } })}
                    />
                    <CalendarioReciclagem
                      className="lg:col-span-2"
                      projecao={painel.validades.projecao}
                      onSelecionarMes={(mes) =>
                        mes && navigate({ to: "/validades", search: { mes } })
                      }
                    />
                  </>
                )}
                {indicador === "armarios" && (
                  <OcupacaoVestiarioChart dados={painel.armarios.porVestiario} />
                )}
                {indicador === "estoque" && (
                  <RitmoContagemChart className="lg:col-span-3" ritmo={painel.estoque.ritmo} />
                )}
              </div>
            </section>
          )}
        </details>
      </main>
    </AppFrame>
  );
}
