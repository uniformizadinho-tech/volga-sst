import type { ReactNode } from "react";
import { AlertTriangle, Download, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FIELD_LABELS,
  type ImportPlan,
  type Locker,
  type LockerFields,
  type StandardizationPlan,
} from "@/lib/lockers-domain";

const LIMITE = 50;

function label(l: Locker): string {
  return `${l.numero}${l.localizacao ? ` (${l.localizacao})` : ""}`;
}

function Contador({
  valor,
  rotulo,
  tom,
}: {
  valor: number;
  rotulo: string;
  tom: "novo" | "atual" | "neutro" | "erro";
}) {
  const cls = {
    novo: "bg-accent/10 text-accent dark:text-accent",
    atual: "bg-accent/10 text-accent",
    neutro: "bg-muted text-foreground",
    erro: "bg-destructive/10 text-destructive",
  }[tom];
  return (
    <div className={`rounded-md p-2 text-center ${cls}`}>
      <p className="text-2xl font-bold">{valor}</p>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
    </div>
  );
}

function Mudancas({
  antes,
  depois,
  campos,
}: {
  antes: Locker;
  depois: Locker;
  campos: Array<keyof LockerFields>;
}) {
  return (
    <div className="space-y-0.5">
      {campos.map((c) => (
        <div key={c}>
          <span className="text-muted-foreground">{FIELD_LABELS[c]}:</span>{" "}
          <span className="line-through opacity-60">{antes[c] || "vazio"}</span> →{" "}
          <span className="font-medium">{depois[c] || "vazio"}</span>
        </div>
      ))}
    </div>
  );
}

function Secao({
  titulo,
  children,
  tom = "neutro",
}: {
  titulo: string;
  children: ReactNode;
  tom?: "neutro" | "erro" | "alerta";
}) {
  const cls = {
    neutro: "border-border",
    erro: "border-destructive/30 bg-destructive/5",
    alerta: "border-amber-500/40 bg-amber-500/5",
  }[tom];
  return (
    <div className={`rounded-md border p-3 text-sm ${cls}`}>
      <p className="mb-2 font-medium">{titulo}</p>
      <div className="max-h-56 overflow-y-auto text-xs">{children}</div>
    </div>
  );
}

function Mais({ total }: { total: number }) {
  if (total <= LIMITE) return null;
  return (
    <p className="pt-1 text-muted-foreground">
      e mais {total - LIMITE}… (veja o relatório completo)
    </p>
  );
}

export interface ImportReview extends ImportPlan {
  fileName: string;
  warnings: string[];
}

export function ImportPreviewDialog({
  review,
  confirming,
  onCancel,
  onConfirm,
  onDownloadReport,
}: {
  review: ImportReview | null;
  confirming: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onDownloadReport: () => void;
}) {
  const problemas = review ? review.warnings.length + review.conflitosArquivo.length : 0;
  const totalGravar = review ? review.novos.length + review.atualizados.length : 0;
  return (
    <Dialog open={review !== null} onOpenChange={(o) => !o && !confirming && onCancel()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Revisar importação antes de gravar</DialogTitle>
          <DialogDescription>
            {review?.fileName} — nada foi salvo ainda. Confira o que vai mudar e confirme para
            gravar na nuvem.
          </DialogDescription>
        </DialogHeader>

        {review && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Contador valor={review.novos.length} rotulo="Novos" tom="novo" />
              <Contador valor={review.atualizados.length} rotulo="Atualizados" tom="atual" />
              <Contador valor={review.semAlteracao} rotulo="Sem alteração" tom="neutro" />
              <Contador valor={problemas} rotulo="Problemas" tom="erro" />
            </div>

            {(review.warnings.length > 0 || review.conflitosArquivo.length > 0) && (
              <Secao titulo="Problemas encontrados no arquivo" tom="erro">
                {review.conflitosArquivo.map((c) => (
                  <p key={`${c.numero}|${c.localizacao}`} className="py-0.5">
                    <strong>
                      {c.numero} ({c.localizacao})
                    </strong>
                    : {c.motivo} Mantido: {c.mantido.ocupante || "livre"}; descartado(s):{" "}
                    {c.descartados.map((d) => d.ocupante || "livre").join(", ")}.
                  </p>
                ))}
                {review.warnings.slice(0, LIMITE).map((w, i) => (
                  <p key={i} className="py-0.5">
                    {w}
                  </p>
                ))}
                <Mais total={review.warnings.length} />
              </Secao>
            )}

            {review.ocupantesDuplicados.length > 0 && (
              <Secao
                titulo={`${review.ocupantesDuplicados.length} colaborador(es) ficarão em mais de um armário`}
                tom="alerta"
              >
                {review.ocupantesDuplicados.slice(0, LIMITE).map((d) => (
                  <p key={d.nome} className="py-0.5">
                    <strong>{d.nome}</strong>: {d.armarios.join(", ")}
                  </p>
                ))}
                <Mais total={review.ocupantesDuplicados.length} />
              </Secao>
            )}

            {review.atualizados.length > 0 && (
              <Secao titulo={`Atualizados (${review.atualizados.length})`}>
                <table className="w-full">
                  <tbody>
                    {review.atualizados.slice(0, LIMITE).map((a) => (
                      <tr
                        key={a.depois.id}
                        className="border-t border-border align-top first:border-t-0"
                      >
                        <td className="w-32 py-1.5 pr-2 font-medium">{label(a.depois)}</td>
                        <td className="py-1.5">
                          <Mudancas antes={a.antes} depois={a.depois} campos={a.campos} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Mais total={review.atualizados.length} />
              </Secao>
            )}

            {review.novos.length > 0 && (
              <Secao titulo={`Novos (${review.novos.length})`}>
                {review.novos.slice(0, LIMITE).map((l) => (
                  <p key={l.id} className="py-0.5">
                    <strong>{label(l)}</strong> — {l.ocupante || "livre"}
                    {l.setor ? ` · ${l.setor}` : ""}
                  </p>
                ))}
                <Mais total={review.novos.length} />
              </Secao>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={onDownloadReport} disabled={!review}>
            <Download className="mr-1.5 h-4 w-4" />
            Baixar relatório
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCancel} disabled={confirming}>
              Cancelar
            </Button>
            <Button onClick={onConfirm} disabled={confirming || totalGravar === 0}>
              {confirming && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {totalGravar === 0 ? "Nada para gravar" : `Gravar ${totalGravar} armário(s)`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StandardizeDialog({
  plan,
  confirming,
  onCancel,
  onConfirm,
}: {
  plan: StandardizationPlan | null;
  confirming: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const total = plan ? plan.atualizar.length + plan.remover.length : 0;
  return (
    <Dialog open={plan !== null} onOpenChange={(o) => !o && !confirming && onCancel()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Padronizar base de armários</DialogTitle>
          <DialogDescription>
            Corrige grafias (local, vestiário, setor, situação), numeração e remove cópias vazias de
            armários duplicados. Duplicados com dados diferentes não são tocados.
          </DialogDescription>
        </DialogHeader>

        {plan && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Contador valor={plan.atualizar.length} rotulo="Serão corrigidos" tom="atual" />
              <Contador valor={plan.remover.length} rotulo="Cópias vazias removidas" tom="erro" />
              <Contador valor={plan.conflitos.length} rotulo="Revisão manual" tom="neutro" />
            </div>

            {plan.remover.length > 0 && (
              <Secao titulo="Cópias vazias que serão removidas" tom="erro">
                {plan.remover.map((l) => (
                  <p key={l.id} className="py-0.5">
                    {l.numero} (gravado como “{l.localizacao}”) — existe outro registro deste
                    armário com os dados.
                  </p>
                ))}
              </Secao>
            )}

            {plan.conflitos.length > 0 && (
              <Secao titulo="Duplicados que precisam de decisão manual" tom="alerta">
                <p className="mb-1 flex items-center gap-1 text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5" /> Edite ou exclua um dos registros de cada
                  armário abaixo.
                </p>
                {plan.conflitos.map((g) => (
                  <p key={g[0].id} className="py-0.5">
                    <strong>{g[0].numero}</strong>:{" "}
                    {g.map((l) => `${l.ocupante || "livre"} (${l.localizacao})`).join(" × ")}
                  </p>
                ))}
              </Secao>
            )}

            {plan.atualizar.length > 0 && (
              <Secao titulo={`Correções (${plan.atualizar.length})`}>
                <table className="w-full">
                  <tbody>
                    {plan.atualizar.slice(0, LIMITE).map((a) => (
                      <tr
                        key={a.antes.id}
                        className="border-t border-border align-top first:border-t-0"
                      >
                        <td className="w-32 py-1.5 pr-2 font-medium">{label(a.depois)}</td>
                        <td className="py-1.5">
                          <Mudancas antes={a.antes} depois={a.depois} campos={a.campos} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Mais total={plan.atualizar.length} />
              </Secao>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={confirming}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} disabled={confirming || total === 0}>
            {confirming && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {total === 0 ? "Nada a corrigir" : "Aplicar padronização"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
