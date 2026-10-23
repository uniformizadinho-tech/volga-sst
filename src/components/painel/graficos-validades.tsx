import { Bar, BarChart, CartesianGrid, Cell, Label, Pie, PieChart, XAxis, YAxis } from "recharts";
import { CalendarClock, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import type { MesVencimento, ProjecaoVencimentos, ResumoNr, ResumoValidades } from "@/lib/validity";

/** Cores semânticas únicas para todos os gráficos de validade (mesmo significado em todo o sistema). */
export const CORES_STATUS = {
  vencido: "var(--destructive)",
  atencao: "var(--warning)",
  ok: "var(--accent)",
  indefinido: "var(--muted-foreground)",
} as const;

export function CabecalhoGrafico({
  titulo,
  subtitulo,
  icone,
  extra,
}: {
  titulo: string;
  subtitulo?: string;
  icone?: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="sst-chart-head mb-4 flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        {icone && <span className="sst-chart-icon">{icone}</span>}
        <div>
          <p className="sst-chart-title">{titulo}</p>
          {subtitulo && <p className="mt-0.5 text-xs text-muted-foreground">{subtitulo}</p>}
        </div>
      </div>
      {extra}
    </div>
  );
}

export function EstadoVazio({ texto }: { texto: string }) {
  return (
    <div className="flex h-full min-h-[160px] items-center justify-center sst-chart-empty rounded-2xl border border-dashed border-border px-6 text-center text-xs text-muted-foreground">
      {texto}
    </div>
  );
}

const configConformidade = {
  vencido: { label: "Vencidos", color: CORES_STATUS.vencido },
  atencao: { label: "A vencer", color: CORES_STATUS.atencao },
  ok: { label: "Em dia", color: CORES_STATUS.ok },
  indefinido: { label: "Sem prazo", color: CORES_STATUS.indefinido },
} satisfies ChartConfig;

/** Anel de conformidade: % válido no centro, fatias por situação. Clique numa fatia filtra a lista. */
export function AnelConformidade({
  resumo,
  onSelecionar,
  className,
}: {
  resumo: ResumoValidades;
  onSelecionar?: (status: keyof typeof CORES_STATUS) => void;
  className?: string;
}) {
  const dados = (Object.keys(configConformidade) as (keyof typeof configConformidade)[])
    .map((k) => ({ status: k, qtd: resumo.porStatus[k], fill: `var(--color-${k})` }))
    .filter((d) => d.qtd > 0);
  const pct = resumo.conformidadePct;
  const cor =
    pct === null
      ? "text-muted-foreground"
      : pct >= 95
        ? "text-accent"
        : pct >= 85
          ? "text-warning"
          : "text-destructive";
  return (
    <Card className={cn("p-4", className)}>
      <CabecalhoGrafico
        titulo="Conformidade"
        subtitulo="Certificados emitidos válidos entre os que têm prazo definido"
        icone={<ShieldCheck className="h-4 w-4" />}
      />
      {resumo.total === 0 ? (
        <EstadoVazio texto="Gere certificados com validade para acompanhar a conformidade." />
      ) : (
        <>
          <ChartContainer config={configConformidade} className="mx-auto aspect-square h-[190px]">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent nameKey="status" hideLabel />} />
              <Pie
                data={dados}
                dataKey="qtd"
                nameKey="status"
                innerRadius={58}
                outerRadius={80}
                paddingAngle={3}
                cornerRadius={6}
                strokeWidth={0}
                onClick={(d: { status?: keyof typeof CORES_STATUS }) =>
                  d?.status && onSelecionar?.(d.status)
                }
                className={onSelecionar ? "cursor-pointer" : undefined}
              >
                {dados.map((d) => (
                  <Cell key={d.status} fill={d.fill} />
                ))}
                <Label
                  content={({ viewBox }) => {
                    if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null;
                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy ?? 0) - 6}
                          className={cn("fill-current text-[28px] font-extrabold", cor)}
                        >
                          {pct === null ? "—" : `${pct.toLocaleString("pt-BR")}%`}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy ?? 0) + 14}
                          className="fill-muted-foreground text-[11px]"
                        >
                          conformidade
                        </tspan>
                      </text>
                    );
                  }}
                />
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            {(Object.keys(configConformidade) as (keyof typeof configConformidade)[]).map((k) => (
              <button
                key={k}
                type="button"
                disabled={!onSelecionar || resumo.porStatus[k] === 0}
                onClick={() => onSelecionar?.(k)}
                className="flex items-center justify-between gap-2 rounded px-1.5 py-1 text-left transition-colors enabled:hover:bg-muted disabled:opacity-60"
              >
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: CORES_STATUS[k] }} />
                  {configConformidade[k].label}
                </span>
                <strong className="tabular-nums">{resumo.porStatus[k]}</strong>
              </button>
            ))}
          </div>
          <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
            {resumo.pessoas} colaborador{resumo.pessoas === 1 ? "" : "es"} acompanhado
            {resumo.pessoas === 1 ? "" : "s"}
            {resumo.pessoasComVencido > 0 ? (
              <>
                {" "}
                ·{" "}
                <span className="font-medium text-destructive">
                  {resumo.pessoasComVencido} com treinamento vencido
                </span>
              </>
            ) : (
              " · nenhum com treinamento vencido"
            )}
          </p>
        </>
      )}
    </Card>
  );
}

const configCalendario = {
  dentroDaJanela: { label: "Dentro do alerta", color: CORES_STATUS.atencao },
  foraDaJanela: { label: "Programar", color: "var(--primary)" },
} satisfies ChartConfig;

/**
 * Calendário de reciclagem: quantos treinamentos vencem em cada mês. É o gráfico de PLANEJAMENTO —
 * mostra quando abrir turma e de qual NR, antes de virar vencido.
 */
export function CalendarioReciclagem({
  projecao,
  mesAtivo,
  onSelecionarMes,
  className,
  altura = 190,
}: {
  projecao: ProjecaoVencimentos;
  mesAtivo?: string | null;
  onSelecionarMes?: (chave: string | null) => void;
  className?: string;
  altura?: number;
}) {
  const dados = projecao.meses.map((m) => ({ ...m, foraDaJanela: m.vencem - m.dentroDaJanela }));
  const totalHorizonte = dados.reduce((s, m) => s + m.vencem, 0);
  const porRotulo = new Map(dados.map((m) => [m.rotulo, m]));
  return (
    <Card className={cn("p-4", className)}>
      <CabecalhoGrafico
        titulo="Calendário de reciclagem"
        subtitulo={`Vencimentos nos próximos ${projecao.meses.length} meses${onSelecionarMes ? " · clique num mês para filtrar" : ""}`}
        icone={<CalendarClock className="h-4 w-4" />}
        extra={
          <div className="text-right text-xs">
            {projecao.atrasados > 0 && (
              <p className="font-semibold text-destructive">
                {projecao.atrasados} já vencido{projecao.atrasados === 1 ? "" : "s"}
              </p>
            )}
            {projecao.pico && (
              <p className="text-muted-foreground">
                Pico: <strong className="text-foreground">{projecao.pico.rotulo}</strong> (
                {projecao.pico.vencem})
              </p>
            )}
          </div>
        }
      />
      {totalHorizonte === 0 ? (
        <EstadoVazio
          texto={
            projecao.atrasados > 0
              ? "Nada novo vence no período — regularize os vencidos."
              : "Nenhum vencimento previsto no período."
          }
        />
      ) : (
        <ChartContainer
          config={configCalendario}
          className="w-full"
          style={{ height: altura, aspectRatio: "auto" }}
        >
          <BarChart
            data={dados}
            margin={{ top: 6, right: 4, left: -22, bottom: 0 }}
            onClick={(s) => {
              if (!onSelecionarMes || !s?.activeLabel) return;
              const m = porRotulo.get(String(s.activeLabel));
              if (m) onSelecionarMes(mesAtivo === m.chave ? null : m.chave);
            }}
            className={onSelecionarMes ? "cursor-pointer" : undefined}
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="rotulo"
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              fontSize={11}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={44}
              fontSize={11}
            />
            <ChartTooltip
              cursor={{ fill: "var(--muted)", opacity: 0.5 }}
              content={({ active, payload }) => {
                const m = active ? (payload?.[0]?.payload as MesVencimento | undefined) : undefined;
                if (!m) return null;
                return (
                  <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-xl">
                    <p className="font-semibold capitalize">{m.rotulo}</p>
                    <p>
                      {m.vencem} treinamento{m.vencem === 1 ? "" : "s"} vence
                      {m.vencem === 1 ? "" : "m"}
                    </p>
                    {m.dentroDaJanela > 0 && (
                      <p className="text-warning">{m.dentroDaJanela} já no alerta</p>
                    )}
                    {m.principaisNrs.length > 0 && (
                      <p className="mt-1 text-muted-foreground">
                        Turmas: {m.principaisNrs.map((n) => `${n.nr} (${n.qtd})`).join(", ")}
                      </p>
                    )}
                  </div>
                );
              }}
            />
            <Bar
              dataKey="dentroDaJanela"
              stackId="m"
              fill="var(--color-dentroDaJanela)"
              radius={[0, 0, 0, 0]}
            >
              {dados.map((m) => (
                <Cell key={m.chave} fillOpacity={mesAtivo && mesAtivo !== m.chave ? 0.35 : 1} />
              ))}
            </Bar>
            <Bar
              dataKey="foraDaJanela"
              stackId="m"
              fill="var(--color-foraDaJanela)"
              radius={[8, 8, 0, 0]}
            >
              {dados.map((m) => (
                <Cell key={m.chave} fillOpacity={mesAtivo && mesAtivo !== m.chave ? 0.35 : 1} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </Card>
  );
}

const configNorma = {
  vencidos: { label: "Vencidos", color: CORES_STATUS.vencido },
  atencao: { label: "A vencer", color: CORES_STATUS.atencao },
  ok: { label: "Em dia", color: CORES_STATUS.ok },
  indefinido: { label: "Sem prazo", color: CORES_STATUS.indefinido },
} satisfies ChartConfig;

/** Situação por norma (barras empilhadas). Clique numa NR para filtrar. */
export function SituacaoPorNorma({
  porNr,
  ativo,
  onSelecionar,
  limite = 8,
  className,
}: {
  porNr: ResumoNr[];
  ativo?: string;
  onSelecionar?: (nr: string) => void;
  limite?: number;
  className?: string;
}) {
  const dados = porNr.slice(0, limite);
  const altura = Math.max(150, dados.length * 30 + 24);
  return (
    <Card className={cn("p-4", className)}>
      <CabecalhoGrafico
        titulo="Situação por norma"
        subtitulo={`Onde agir primeiro${onSelecionar ? " · clique numa NR para filtrar" : ""}`}
      />
      {dados.length === 0 ? (
        <EstadoVazio texto="Sem treinamentos acompanhados." />
      ) : (
        <ChartContainer
          config={configNorma}
          className="w-full"
          style={{ height: altura, aspectRatio: "auto" }}
        >
          <BarChart
            data={dados}
            layout="vertical"
            margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
            barCategoryGap={6}
            onClick={(s) => s?.activeLabel && onSelecionar?.(String(s.activeLabel))}
            className={onSelecionar ? "cursor-pointer" : undefined}
          >
            <CartesianGrid horizontal={false} strokeDasharray="3 3" />
            <XAxis
              type="number"
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              fontSize={11}
            />
            <YAxis
              type="category"
              dataKey="nr"
              width={58}
              tickLine={false}
              axisLine={false}
              fontSize={11}
              tick={({ x, y, payload }: { x: number; y: number; payload: { value: string } }) => (
                <text
                  x={x - 4}
                  y={y}
                  dy={4}
                  textAnchor="end"
                  className={cn(
                    "fill-muted-foreground text-[11px]",
                    ativo === payload.value && "fill-foreground font-bold",
                  )}
                >
                  {payload.value}
                </text>
              )}
            />
            <ChartTooltip
              cursor={{ fill: "var(--muted)", opacity: 0.5 }}
              content={<ChartTooltipContent />}
            />
            <Bar dataKey="vencidos" stackId="n" fill="var(--color-vencidos)" />
            <Bar dataKey="atencao" stackId="n" fill="var(--color-atencao)" />
            <Bar dataKey="ok" stackId="n" fill="var(--color-ok)" />
            <Bar
              dataKey="indefinido"
              stackId="n"
              fill="var(--color-indefinido)"
              radius={[0, 8, 8, 0]}
            />
          </BarChart>
        </ChartContainer>
      )}
    </Card>
  );
}
