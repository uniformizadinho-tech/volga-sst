import { useMemo } from "react";
import { AlertTriangle, Target, TrendingDown, TrendingUp } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EstoqueItem, EstoqueLancamento } from "@/lib/estoque-store";
import { analisarContagem, divergenciaPorTipo, topDivergencias } from "@/lib/estoque-analytics";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("pt-BR")}%`);

interface Props {
  itens: EstoqueItem[];
  lancamentos: EstoqueLancamento[];
  onVerDivergentes: () => void;
}

/** Resultado gerencial da contagem: acuracidade, impacto financeiro e o que recontar primeiro. */
export function ResultadoContagem({ itens, lancamentos, onVerDivergentes }: Props) {
  const { linhas, resumo } = useMemo(
    () => analisarContagem(itens, lancamentos),
    [itens, lancamentos],
  );
  const top = useMemo(() => topDivergencias(linhas, 5), [linhas]);
  const porTipo = useMemo(
    () =>
      divergenciaPorTipo(linhas)
        .filter((t) => t.divergentes > 0)
        .slice(0, 5),
    [linhas],
  );

  if (itens.length === 0 || resumo.conferidos === 0) return null;

  const acuracia = resumo.acuraciaPct;
  const corAcuracia =
    acuracia === null
      ? "text-muted-foreground"
      : acuracia >= 95
        ? "text-accent"
        : acuracia >= 85
          ? "text-amber-600"
          : "text-destructive";
  const semDivergencia = resumo.itensComFalta + resumo.itensComSobra === 0;

  return (
    <Card className="mb-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4" />
          <div>
            <p className="text-sm font-semibold">Resultado da contagem</p>
            <p className="text-xs text-muted-foreground">
              {resumo.conferidos} de {resumo.totalItens} itens conferidos (
              {pct(resumo.coberturaPct)})
              {resumo.pendentes > 0
                ? ` · ${resumo.pendentes} ainda sem leitura`
                : " · contagem completa"}
            </p>
          </div>
        </div>
        {!semDivergencia && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onVerDivergentes}>
            <AlertTriangle className="h-3.5 w-3.5" /> Ver divergentes na tabela
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
        <div className="bg-card p-4">
          <p className="text-xs text-muted-foreground">Acuracidade</p>
          <p className={cn("mt-1 text-2xl font-bold", corAcuracia)}>{pct(acuracia)}</p>
          <p className="text-xs text-muted-foreground">itens conferidos sem diferença</p>
        </div>
        <div className="bg-card p-4">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingDown className="h-3.5 w-3.5" /> Faltas
          </p>
          <p className="mt-1 text-2xl font-bold text-destructive">{brl(resumo.valorFalta)}</p>
          <p className="text-xs text-muted-foreground">
            {resumo.unidadesFalta} un. em {resumo.itensComFalta} item(ns)
          </p>
        </div>
        <div className="bg-card p-4">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" /> Sobras
          </p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{brl(resumo.valorSobra)}</p>
          <p className="text-xs text-muted-foreground">
            {resumo.unidadesSobra} un. em {resumo.itensComSobra} item(ns)
          </p>
        </div>
        <div className="bg-card p-4">
          <p className="text-xs text-muted-foreground">Saldo financeiro</p>
          <p
            className={cn(
              "mt-1 text-2xl font-bold",
              resumo.valorLiquido < 0 ? "text-destructive" : "text-foreground",
            )}
          >
            {brl(resumo.valorLiquido)}
          </p>
          <p className="text-xs text-muted-foreground">sobras menos faltas (itens com preço)</p>
        </div>
      </div>

      {semDivergencia ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">
          Nenhuma divergência nos itens conferidos até agora.
        </p>
      ) : (
        <div className="grid gap-4 p-4 md:grid-cols-5">
          <div className="md:col-span-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Recontar primeiro (maior impacto)
            </p>
            <ol className="space-y-1.5">
              {top.map((l, i) => (
                <li
                  key={l.item.codBarras}
                  className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {l.item.item}
                    {(l.item.tamanho || l.item.cor) && (
                      <span className="text-muted-foreground">
                        {" "}
                        · {[l.item.tamanho, l.item.cor].filter(Boolean).join(" ")}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    sistema {l.item.estoqueSistema} → contado {l.contado}
                  </span>
                  <span
                    className={cn(
                      "w-20 shrink-0 text-right text-xs font-semibold",
                      l.situacao === "falta" ? "text-destructive" : "text-amber-600",
                    )}
                  >
                    {l.diferenca! > 0 ? "+" : ""}
                    {l.diferenca} un.
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="md:col-span-2">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Onde mais diverge (por tipo)
            </p>
            <ul className="space-y-2">
              {porTipo.map((t) => (
                <li key={t.tipo}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-medium">{t.tipo}</span>
                    <span className="text-muted-foreground">
                      {t.divergentes}/{t.conferidos} divergentes
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-destructive"
                      style={{ width: `${Math.round((t.divergentes / t.conferidos) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Card>
  );
}
