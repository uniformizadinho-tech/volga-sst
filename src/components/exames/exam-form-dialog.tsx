import { useEffect, useState, type FormEvent } from "react";
import { CalendarClock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  addMonthsToIsoDate,
  emptyExamDraft,
  type ExamDraft,
  type ExamRecord,
  parseExamDate,
  parseValidityMonths,
  validateExamDraft,
} from "@/lib/exames";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ExamFormDialog({
  open,
  initial,
  editing,
  saving,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  initial: ExamDraft | null;
  editing: ExamRecord | null;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (draft: ExamDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ExamDraft>(emptyExamDraft);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setDraft(initial ?? emptyExamDraft());
      setErrors([]);
    }
  }, [open, initial]);

  const patch = (delta: Partial<ExamDraft>) => {
    setDraft((current) => {
      const next = { ...current, ...delta };
      if ("performedOn" in delta || "validityMonths" in delta) {
        if (current.dueDateOrigin === "calculado" || !current.dueOn) {
          const derived =
            next.performedOn && next.validityMonths
              ? addMonthsToIsoDate(next.performedOn, next.validityMonths)
              : null;
          next.dueOn = derived;
          next.dueDateOrigin = derived ? "calculado" : "nenhum";
        }
      }
      if ("dueOn" in delta) next.dueDateOrigin = delta.dueOn ? "manual" : "nenhum";
      return next;
    });
  };

  const recalculate = () => {
    const performedOn = parseExamDate(draft.performedOn);
    const dueOn =
      performedOn && draft.validityMonths
        ? addMonthsToIsoDate(performedOn, draft.validityMonths)
        : null;
    setDraft((current) => ({
      ...current,
      dueOn,
      dueDateOrigin: dueOn ? "calculado" : "nenhum",
    }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateExamDraft(draft);
    setErrors(validation);
    if (validation.length) return;
    await onSave(draft);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar exame realizado" : "Registrar exame realizado"}
          </DialogTitle>
          <DialogDescription>
            Cadastre somente identificação e prazos administrativos. Não inclua diagnósticos, laudos
            ou resultados clínicos.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Identificação</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm sm:col-span-2">
                Colaborador <span className="text-destructive">*</span>
                <Input
                  autoComplete="off"
                  maxLength={200}
                  value={draft.employeeName}
                  onChange={(e) => patch({ employeeName: e.target.value })}
                  required
                />
              </label>
              <label className="text-sm sm:col-span-2">
                Empresa <span className="text-destructive">*</span>
                <Input
                  maxLength={255}
                  value={draft.company}
                  onChange={(e) => patch({ company: e.target.value })}
                  required
                />
              </label>
              <label className="text-sm">
                Nome do exame <span className="text-destructive">*</span>
                <Input
                  maxLength={255}
                  value={draft.examName}
                  onChange={(e) => patch({ examName: e.target.value })}
                  placeholder="Ex.: Avaliação clínica ocupacional"
                  required
                />
              </label>
              <label className="text-sm">
                Categoria
                <Select
                  value={draft.examCategory}
                  onValueChange={(value) =>
                    patch({ examCategory: value as ExamDraft["examCategory"] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Clínico">Clínico</SelectItem>
                    <SelectItem value="Complementar">Complementar</SelectItem>
                    <SelectItem value="Outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="text-sm">
                Tipo específico
                <Input
                  maxLength={255}
                  value={draft.specificType}
                  onChange={(e) => patch({ specificType: e.target.value })}
                  placeholder="Ex.: Periódico, Admissional"
                />
              </label>
              <label className="text-sm">
                Prestador / fornecedor
                <Input
                  maxLength={255}
                  value={draft.provider}
                  onChange={(e) => patch({ provider: e.target.value })}
                />
              </label>
              <label className="text-sm">
                Local / unidade de atendimento
                <Input
                  maxLength={255}
                  value={draft.serviceLocation}
                  onChange={(e) => patch({ serviceLocation: e.target.value })}
                />
              </label>
              <label className="text-sm">
                Ordem / referência
                <Input
                  maxLength={255}
                  value={draft.orderReference}
                  onChange={(e) => patch({ orderReference: e.target.value })}
                />
              </label>
            </div>
          </section>

          <section className="space-y-3 border-t border-border pt-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <CalendarClock size={16} /> Datas e vencimento
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm">
                Data realizada <span className="text-destructive">*</span>
                <Input
                  type="date"
                  value={draft.performedOn}
                  onChange={(e) => patch({ performedOn: e.target.value })}
                  required
                />
              </label>
              <label className="text-sm">
                Prazo de validade (meses)
                <Input
                  type="number"
                  min={1}
                  max={1200}
                  step={1}
                  value={draft.validityMonths ?? ""}
                  onChange={(e) =>
                    patch({
                      validityMonths: e.target.value ? parseValidityMonths(e.target.value) : null,
                    })
                  }
                  placeholder="Ex.: 12"
                />
              </label>
              <label className="text-sm">
                Próximo vencimento
                <Input
                  type="date"
                  value={draft.dueOn ?? ""}
                  onChange={(e) => patch({ dueOn: e.target.value || null })}
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {draft.dueDateOrigin === "importado"
                  ? "Data informada na relação importada"
                  : draft.dueDateOrigin === "calculado"
                    ? "Data calculada pela realização + prazo informado"
                    : draft.dueDateOrigin === "manual"
                      ? "Data definida manualmente"
                      : "Sem vencimento definido"}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={recalculate}
                disabled={!draft.performedOn || !draft.validityMonths}
              >
                <RefreshCw size={14} /> Recalcular pelo prazo
              </Button>
            </div>
          </section>

          {errors.length > 0 && (
            <div
              className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              role="alert"
            >
              <ul className="list-inside list-disc">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando…" : editing ? "Salvar alterações" : "Registrar exame"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
