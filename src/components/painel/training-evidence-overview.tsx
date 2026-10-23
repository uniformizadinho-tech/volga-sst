import { AlertTriangle, ArrowRight, Clock3, FileQuestion, RefreshCw, Users } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  TRAINING_LABELS,
  type ResumoMatrizTreinamentos,
  type TrainingStatus,
} from "@/lib/training-matrix";

const STATUS_ORDER: TrainingStatus[] = ["declarado", "nao_possui", "comprovante", "revisar"];
const STATUS_ICONS = {
  declarado: Clock3,
  nao_possui: AlertTriangle,
  comprovante: FileQuestion,
  revisar: AlertTriangle,
} satisfies Record<TrainingStatus, typeof Clock3>;
const STATUS_COLORS: Record<TrainingStatus, string> = {
  declarado: "var(--warning)",
  nao_possui: "var(--destructive)",
  comprovante: "var(--primary)",
  revisar: "var(--muted-foreground)",
};

export function TrainingEvidenceOverview({
  summary,
  loading,
  error,
  onRetry,
}: {
  summary: ResumoMatrizTreinamentos | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  const temRegistros = summary !== null && summary.registros > 0;

  return (
    <Card className="sst-training-evidence overflow-hidden p-5 shadow-sm md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
            Fonte documental independente
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">Matriz de evidências</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            Declarações e registros da planilha aparecem separados dos certificados emitidos e de
            seus prazos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Tentar carregar a Matriz novamente"
            title="Tentar carregar a Matriz novamente"
            disabled={loading}
            onClick={onRetry}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/treinamentos">
              Abrir matriz <ArrowRight className="ml-2 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </header>

      {error && summary && (
        <p className="mt-4 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning" role="status">
          Não foi possível atualizar; mostrando o último resumo carregado.
        </p>
      )}

      {error && !summary ? (
        <div
          className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"
          role="alert"
        >
          <span className="text-destructive">{error}</span>
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={onRetry}>
            Tentar novamente
          </Button>
        </div>
      ) : loading && !summary ? (
        <div
          className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          role="status"
          aria-label="Carregando matriz de evidências"
        >
          {STATUS_ORDER.map((status) => (
            <div key={status} className="h-[78px] animate-pulse rounded-lg bg-muted/60" />
          ))}
        </div>
      ) : !temRegistros ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-dashed border-border bg-muted/20 p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
              <Users className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-medium">Matriz ainda não importada</p>
              <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
                Importe a planilha para acompanhar, por norma, declarações e itens que ainda
                precisam ser conferidos.
              </p>
            </div>
          </div>
          <Button asChild size="sm">
            <Link to="/treinamentos">Importar e conferir</Link>
          </Button>
        </div>
      ) : (
        <>
          <div
            className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            aria-label="Registros por situação"
          >
            {STATUS_ORDER.map((status) => {
              const Icon = STATUS_ICONS[status];
              const value = summary?.porStatus[status] ?? 0;
              return (
                <div
                  key={status}
                  className="flex min-h-[78px] items-center gap-3 rounded-lg border border-border bg-background/70 p-3"
                >
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted/70"
                    style={{ color: STATUS_COLORS[status] }}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xl font-semibold tabular-nums leading-none">{value}</p>
                    <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">
                      {TRAINING_LABELS[status]}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 grid gap-x-8 gap-y-4 md:grid-cols-2">
            {summary?.porNr.map((item) => (
              <div key={item.nr} className="min-w-0">
                <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                  <span className="font-semibold">NR-{item.nr}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {item.total} {item.total === 1 ? "registro atual" : "registros atuais"}
                  </span>
                </div>
                <div
                  className="flex h-2 overflow-hidden rounded-full bg-muted"
                  role="img"
                  aria-label={`NR-${item.nr}: ${STATUS_ORDER.map((status) => `${TRAINING_LABELS[status]}: ${item.porStatus[status]}`).join(", ")}`}
                >
                  {STATUS_ORDER.map((status) => {
                    const count = item.porStatus[status];
                    if (!item.total || !count) return null;
                    return (
                      <span
                        key={status}
                        title={`${TRAINING_LABELS[status]}: ${count}`}
                        style={{
                          width: `${(count / item.total) * 100}%`,
                          backgroundColor: STATUS_COLORS[status],
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="max-w-3xl text-[11px] leading-5 text-muted-foreground">
              {summary?.emAberto} itens atuais da Matriz requerem ação. Declaração de posse não
              substitui comprovante; “Não possui” indica necessidade de treinamento. Esta fonte não
              cria certificados nem define vencimentos.
            </p>
            {(summary?.nomesParaConferir ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-3 py-1.5 text-[11px] font-medium text-warning">
                <AlertTriangle className="h-3.5 w-3.5" />
                {summary?.nomesParaConferir}{" "}
                {summary?.nomesParaConferir === 1 ? "nome repetido" : "nomes repetidos"} para
                conferir
              </span>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
