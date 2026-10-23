import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { LockKeyhole } from "lucide-react";

import { Card } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { CabecalhoGrafico, EstadoVazio } from "@/components/painel/graficos-validades";
import { cn } from "@/lib/utils";
import type { OcupacaoVestiario } from "@/lib/painel-geral";

const config = {
  ocupados: { label: "Ocupados", color: "var(--primary)" },
  livres: { label: "Livres", color: "var(--accent)" },
} satisfies ChartConfig;

/** Ocupação por vestiário: onde existe armário livre para um novo colaborador. */
export function OcupacaoVestiarioChart({
  dados,
  className,
}: {
  dados: OcupacaoVestiario[];
  className?: string;
}) {
  const total = dados.reduce((s, d) => s + d.total, 0);
  const livres = dados.reduce((s, d) => s + d.livres, 0);
  const pend = dados.reduce((s, d) => s + d.comPendencia, 0);
  return (
    <Card className={cn("p-4", className)}>
      <CabecalhoGrafico
        titulo="Armários por vestiário"
        subtitulo="Ocupados x livres em cada vestiário"
        icone={<LockKeyhole className="h-4 w-4" />}
        extra={
          total > 0 ? (
            <div className="text-right text-xs">
              <p>
                <strong className="text-foreground">{livres}</strong> livre{livres === 1 ? "" : "s"}
              </p>
              {pend > 0 && <p className="text-warning">{pend} com pendência</p>}
            </div>
          ) : undefined
        }
      />
      {total === 0 ? (
        <EstadoVazio texto="Importe a planilha de armários para ver a ocupação." />
      ) : (
        <ChartContainer
          config={config}
          className="w-full"
          style={{ height: 190, aspectRatio: "auto" }}
        >
          <BarChart data={dados} barSize={34} margin={{ top: 6, right: 4, left: -22, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="vestiario"
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
              content={<ChartTooltipContent />}
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="ocupados" stackId="a" fill="var(--color-ocupados)" />
            <Bar dataKey="livres" stackId="a" fill="var(--color-livres)" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ChartContainer>
      )}
    </Card>
  );
}
