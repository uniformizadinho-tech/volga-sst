import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ExamImportPreview } from "@/lib/exames-import";

function dateLabel(value: string | null): string {
  if (!value) return "Sem prazo";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function ExamImportDialog({
  preview,
  fileName,
  importing,
  progress,
  onOpenChange,
  onConfirm,
}: {
  preview: ExamImportPreview | null;
  fileName: string;
  importing: boolean;
  progress: { processed: number; total: number };
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <Dialog open={!!preview} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Revisar importação de exames</DialogTitle>
          <DialogDescription className="break-all">Arquivo: {fileName}</DialogDescription>
        </DialogHeader>
        {preview && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-5">
              <div className="rounded-md border p-3">
                <strong className="block text-xl">
                  {preview.records.length.toLocaleString("pt-BR")}
                </strong>
                <span className="text-xs text-muted-foreground">registros válidos</span>
              </div>
              <div className="rounded-md border p-3">
                <strong className="block text-xl">
                  {preview.rejected.length.toLocaleString("pt-BR")}
                </strong>
                <span className="text-xs text-muted-foreground">linhas rejeitadas</span>
              </div>
              <div className="rounded-md border p-3">
                <strong className="block text-xl">
                  {preview.duplicateCandidates.toLocaleString("pt-BR")}
                </strong>
                <span className="text-xs text-muted-foreground">
                  possíveis duplicados no arquivo
                </span>
              </div>
              <div className="rounded-md border p-3">
                <strong className="block text-xl">
                  {preview.missingPerformedDate.toLocaleString("pt-BR")}
                </strong>
                <span className="text-xs text-muted-foreground">sem data realizada</span>
              </div>
              <div className="rounded-md border p-3">
                <strong className="block text-xl">
                  {preview.withoutDueDate.toLocaleString("pt-BR")}
                </strong>
                <span className="text-xs text-muted-foreground">sem vencimento calculável</span>
              </div>
            </div>

            <p className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              Nada será salvo até você confirmar. Registros repetidos já existentes no banco serão
              ignorados pela chave de importação. O sistema guarda somente dados administrativos do
              exame — não laudos, diagnósticos ou resultados clínicos. Foram lidas{" "}
              {preview.sourceRows.toLocaleString("pt-BR")} linhas de origem.
              {preview.missingPerformedDate > 0 &&
                ` ${preview.missingPerformedDate.toLocaleString("pt-BR")} registro(s) ficarão sem data realizada porque a fonte não trouxe uma data válida.`}
              {preview.invalidPerformedDate > 0 &&
                ` ${preview.invalidPerformedDate.toLocaleString("pt-BR")} data(s) de realização estavam preenchidas, mas inválidas.`}
              {preview.invalidDueDate > 0 &&
                ` ${preview.invalidDueDate.toLocaleString("pt-BR")} data(s) de vencimento inválidas serão tratadas como não informadas; quando possível, o prazo será calculado pela data realizada e pelo período.`}
              {preview.withoutDueDate > 0 &&
                ` ${preview.withoutDueDate.toLocaleString("pt-BR")} registro(s) continuarão sem vencimento até alguém completar essa informação.`}
            </p>

            {preview.records.length > 0 && (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[680px] text-left text-xs">
                  <thead className="bg-muted/60 text-muted-foreground">
                    <tr>
                      <th className="p-2">Colaborador</th>
                      <th className="p-2">Exame</th>
                      <th className="p-2">Tipo</th>
                      <th className="p-2">Realizado</th>
                      <th className="p-2">Vencimento</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {preview.records.slice(0, 8).map((record, index) => (
                      <tr key={`${record.employeeName}-${record.performedOn}-${index}`}>
                        <td className="p-2">{record.employeeName}</td>
                        <td className="p-2">{record.examName}</td>
                        <td className="p-2">{record.specificType || record.examCategory}</td>
                        <td className="p-2">{dateLabel(record.performedOn)}</td>
                        <td className="p-2">{dateLabel(record.dueOn)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.records.length > 8 && (
                  <p className="border-t p-2 text-xs text-muted-foreground">
                    Amostra de 8 de {preview.records.length.toLocaleString("pt-BR")} registros.
                  </p>
                )}
              </div>
            )}

            {preview.rejected.length > 0 && (
              <details className="rounded-md border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Ver primeiras linhas rejeitadas ({preview.rejected.length.toLocaleString("pt-BR")}
                  )
                </summary>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {preview.rejected.slice(0, 10).map((item) => (
                    <li key={`${item.row}-${item.reason}`}>
                      Linha {item.row}: {item.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {importing && (
              <div className="space-y-1" role="status">
                <div className="flex justify-between text-xs">
                  <span>Importando lotes</span>
                  <span>
                    {progress.processed.toLocaleString("pt-BR")} /{" "}
                    {progress.total.toLocaleString("pt-BR")}
                  </span>
                </div>
                <progress
                  className="h-2 w-full"
                  max={Math.max(progress.total, 1)}
                  value={progress.processed}
                />
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={importing}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void onConfirm()}
            disabled={importing || !preview?.records.length}
          >
            {importing
              ? "Importando…"
              : `Confirmar importação (${preview?.records.length.toLocaleString("pt-BR") ?? 0})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
