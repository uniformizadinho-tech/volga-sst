import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Info } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { loadHistory } from "@/lib/history-store";
import { loadLockersCache } from "@/lib/lockers-store";
import { carregarEstoqueItens, carregarLancamentos } from "@/lib/estoque-store";
import { buildValidadeRows } from "@/lib/validity";
import { montarPendencias, type Pendencia, type Severidade } from "@/lib/pendencias";
import { lerJanelaAtencao } from "@/lib/validity-prefs";

const ESTILO: Record<Severidade, { barra: string; icone: string; Icon: typeof Info }> = {
  critica: {
    barra: "bg-destructive",
    icone: "bg-destructive/15 text-destructive",
    Icon: AlertTriangle,
  },
  atencao: { barra: "bg-warning", icone: "bg-warning-soft text-warning", Icon: Clock },
  info: { barra: "bg-accent", icone: "bg-accent/15 text-accent", Icon: Info },
};

const AREA_LABEL = {
  certificados: "Certificados",
  estoque: "Estoque",
  armarios: "Armários",
  inspecoes: "Inspeções",
} as const;

/** Fila de ação do dia: o que precisa de atenção agora, com um clique até a tela já filtrada. */
export function PendenciasPanel({
  pendencias: externas,
}: { pendencias?: Pendencia[] | null } = {}) {
  const [calculadas, setPendencias] = useState<Pendencia[] | null>(null);
  // Quando a tela já calculou o painel (Visão geral), reaproveita: mesma base, sem recálculo.
  const controlado = externas !== undefined;
  const pendencias = controlado ? externas : calculadas;

  useEffect(() => {
    if (controlado) return;
    const janelaDias = lerJanelaAtencao();
    setPendencias(
      montarPendencias({
        validades: buildValidadeRows(loadHistory(), new Date(), { janelaAtencaoDias: janelaDias }),
        janelaDias,
        armarios: loadLockersCache(),
        estoqueItens: carregarEstoqueItens(),
        lancamentos: carregarLancamentos(),
      }),
    );
  }, [controlado]);

  if (pendencias === null)
    return <Card className="h-28 w-full animate-pulse bg-muted/40" aria-hidden />;

  return (
    <Card className="w-full overflow-hidden" aria-label="Pendências de hoje">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold">Pendências de hoje</h2>
          <p className="text-xs text-muted-foreground">
            {pendencias.length === 0
              ? "Nada exigindo ação agora."
              : `${pendencias.length} ${pendencias.length === 1 ? "assunto precisa" : "assuntos precisam"} de atenção`}
          </p>
        </div>
      </div>
      {pendencias.length === 0 ? (
        <div className="flex items-center gap-3 px-5 py-6 text-sm text-muted-foreground">
          <CheckCircle2 className="h-5 w-5 text-accent" />
          Nenhuma pendência identificada na base consultada de treinamentos, estoque e armários.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {pendencias.map((p) => {
            const s = ESTILO[p.severidade];
            return (
              <li
                key={p.id}
                className="sst-priority-row relative flex items-center gap-4 px-5 py-3 transition-colors hover:bg-muted/40"
              >
                <span className={cn("absolute inset-y-0 left-0 w-1", s.barra)} />
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
                    s.icone,
                  )}
                >
                  <s.Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{p.titulo}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">{AREA_LABEL[p.area]}</span> · {p.detalhe}
                  </p>
                </div>
                <Button
                  asChild
                  size="sm"
                  variant={p.severidade === "critica" ? "default" : "outline"}
                  className="shrink-0 gap-1.5"
                >
                  <Link to={p.to} search={p.search as never}>
                    {p.acao}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
