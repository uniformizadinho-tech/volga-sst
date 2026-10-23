import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { Gauge, TrendingDown } from "lucide-react";

import { Card } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { CabecalhoGrafico, EstadoVazio } from "@/components/painel/graficos-validades";
import { cn } from "@/lib/utils";
import {
  analisarContagem,
  impactoPorTipo,
  ritmoContagem,
  type LinhaContagem,
  type RitmoContagem,
} from "@/lib/estoque-analytics";
import type { EstoqueItem, EstoqueLancamento } from "@/lib/estoque-store";

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function formatarHoras(h: number | null): string {
  if (h === null) return "—";
  if (h === 0) return "concluída";
  if (h < 1) return `~${Math.max(1, Math.round(h * 60))} min`;
  const horas = Math.floor(h);
  const min = Math.round((h - horas) * 60);
  return `~${horas}h${min ? String(min).padStart(2, "0") : ""}`;
}

const configRitmo = {
  coberturaPct: { label: "Cobertura", color: "var(--accent)" },
} satisfies ChartConfig;

/** Evolução da cobertura no tempo + previsão de término no ritmo atual. */
export function RitmoContagemChart({
  ritmo,
  className,
}: {
  ritmo: RitmoContagem;
  className?: string;
}) {
  return (
    <Card className={cn("p-4", className)}>
      <CabecalhoGrafico
        titulo="Ritmo da contagem"
        subtitulo="Cobertura acumulada do catálogo ao longo da contagem"
        icone={<Gauge className="h-4 w-4" />}
        extra={
          <div className="text-right text-xs">
            <p>
              <strong className="text-foreground">
                {ritmo.itensPorHora !== null
                  ? `${ritmo.itensPorHora.toLocaleString("pt-BR")} itens/h`
                  : "—"}
              </strong>
            </p>
            <p className="text-muted-foreground">Faltam {formatarHoras(ritmo.horasRestantes)}</p>
          </div>
        }
      />
      {ritmo.pontos.length < 2 ? (
        <EstadoVazio texto="O gráfico aparece depois das primeiras leituras com horário registrado." />
      ) : (
        <ChartContainer
          config={configRitmo}
          className="w-full"
          style={{ height: 170, aspectRatio: "auto" }}
        >
          <AreaChart data={ritmo.pontos} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="fillCobertura" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-coberturaPct)" stopOpacity={0.45} />
                <stop offset="95%" stopColor="var(--color-coberturaPct)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="rotulo"
              tickLine={false}
              axisLine={false}
              minTickGap={24}
              fontSize={11}
            />
            <YAxis
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
              tickLine={false}
              axisLine={false}
              width={46}
              fontSize={11}
            />
            <ReferenceLine y={100} stroke="var(--border)" strokeDasharray="4 4" />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(v) => `${Number(v).toLocaleString("pt-BR")}% do catálogo`}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="coberturaPct"
              stroke="var(--color-coberturaPct)"
              strokeWidth={2.5}
              fill="url(#fillCobertura)"
            />
          </AreaChart>
        </ChartContainer>
      )}
    </Card>
  );
}

const configImpacto = {
  falta: { label: "Falta (R$)", color: "var(--destructive)" },
  sobra: { label: "Sobra (R$)", color: "var(--warning)" },
} satisfies ChartConfig;

/** Onde o inventário diverge, em dinheiro: faltas x sobras por tipo de produto. */
export function ImpactoPorTipoChart({
  linhas,
  className,
}: {
  linhas: LinhaContagem[];
  className?: string;
}) {
  const dados = useMemo(() => impactoPorTipo(linhas, 6), [linhas]);
  const temValor = dados.some((d) => d.falta + d.sobra > 0);
  return (
    <Card className={cn("p-4", className)}>
      <CabecalhoGrafico
        titulo="Impacto por tipo"
        subtitulo="Faltas e sobras valorizadas pelo preço do catálogo"
        icone={<TrendingDown className="h-4 w-4" />}
      />
      {dados.length === 0 ? (
        <EstadoVazio texto="Nenhuma divergência entre o contado e o sistema até agora." />
      ) : !temValor ? (
        <EstadoVazio texto="Há divergências, mas os itens não têm preço no catálogo. Importe o preço para ver o impacto em R$." />
      ) : (
        <ChartContainer
          config={configImpacto}
          className="w-full"
          style={{ height: Math.max(150, dados.length * 34 + 30), aspectRatio: "auto" }}
        >
          <BarChart
            data={dados}
            layout="vertical"
            margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
            barCategoryGap={6}
          >
            <CartesianGrid horizontal={false} strokeDasharray="3 3" />
            <XAxis
              type="number"
              tickFormatter={(v) => brl(Number(v))}
              tickLine={false}
              axisLine={false}
              fontSize={11}
            />
            <YAxis
              type="category"
              dataKey="tipo"
              width={92}
              tickLine={false}
              axisLine={false}
              fontSize={11}
            />
            <ChartTooltip
              cursor={{ fill: "var(--muted)", opacity: 0.5 }}
              content={
                <ChartTooltipContent
                  formatter={(v, nome) =>
                    `${configImpacto[nome as keyof typeof configImpacto]?.label ?? nome}: ${brl(Number(v))}`
                  }
                />
              }
            />
            <Bar dataKey="falta" stackId="i" fill="var(--color-falta)" />
            <Bar dataKey="sobra" stackId="i" fill="var(--color-sobra)" radius={[0, 8, 8, 0]} />
          </BarChart>
        </ChartContainer>
      )}
    </Card>
  );
}

/** Bloco de gráficos da tela de contagem (substitui o gráfico que repetia os números dos cards). */
export function GraficosContagem({
  itens,
  lancamentos,
}: {
  itens: EstoqueItem[];
  lancamentos: EstoqueLancamento[];
}) {
  const ritmo = useMemo(() => ritmoContagem(itens, lancamentos), [itens, lancamentos]);
  const { linhas } = useMemo(() => analisarContagem(itens, lancamentos), [itens, lancamentos]);
  if (!itens.length || !lancamentos.length) return null;
  return (
    <div className="mb-4 grid gap-3 lg:grid-cols-2">
      <RitmoContagemChart ritmo={ritmo} />
      <ImpactoPorTipoChart linhas={linhas} />
    </div>
  );
}
