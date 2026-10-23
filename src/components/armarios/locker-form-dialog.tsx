import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  LOCALIZACOES_PADRAO,
  SITUACOES_PADRAO,
  VESTIARIOS_PADRAO,
  normalizeLocker,
  ocupanteKey,
  slotKey,
  type Locker,
  type LockerFields,
} from "@/lib/lockers-domain";

const SEM_PENDENCIA = "__sem_pendencia__";

export interface LockerFormResult {
  locker: Locker;
  /** Armários que devem ser liberados porque o colaborador foi transferido. */
  liberar: Locker[];
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
}

export function LockerFormDialog({
  open,
  onOpenChange,
  initial,
  lockers,
  saving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Armário em edição, ou um rascunho com id novo para cadastro. */
  initial: Locker;
  lockers: Locker[];
  saving: boolean;
  onSubmit: (result: LockerFormResult) => void;
}) {
  const [form, setForm] = useState<LockerFields>(initial);
  const [liberarAnterior, setLiberarAnterior] = useState(true);
  const [tentouSalvar, setTentouSalvar] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial);
      setLiberarAnterior(true);
      setTentouSalvar(false);
    }
  }, [open, initial]);

  const isEdit = lockers.some((l) => l.id === initial.id);
  const set = (patch: Partial<LockerFields>) => setForm((f) => ({ ...f, ...patch }));

  const opcoes = useMemo(
    () => ({
      vestiarios: unique([...VESTIARIOS_PADRAO, ...lockers.map((l) => l.vestiario)]),
      locais: unique([...LOCALIZACOES_PADRAO, ...lockers.map((l) => l.localizacao)]),
      setores: unique(lockers.map((l) => l.setor)),
    }),
    [lockers],
  );

  const normalizado = useMemo(() => normalizeLocker({ ...form }), [form]);
  const numeroVazio = !normalizado.numero;
  const conflitoSlot = useMemo(
    () =>
      numeroVazio
        ? undefined
        : lockers.find((l) => l.id !== initial.id && slotKey(l) === slotKey(normalizado)),
    [lockers, normalizado, initial.id, numeroVazio],
  );
  const ocupanteEmOutros = useMemo(() => {
    if (!normalizado.ocupante) return [];
    const k = ocupanteKey(normalizado.ocupante);
    return lockers.filter(
      (l) => l.id !== initial.id && l.ocupante && ocupanteKey(l.ocupante) === k,
    );
  }, [lockers, normalizado.ocupante, initial.id]);

  const situacaoValue = form.situacao ? normalizado.situacao : SEM_PENDENCIA;
  const situacoes = unique([
    ...SITUACOES_PADRAO,
    ...(normalizado.situacao ? [normalizado.situacao] : []),
  ]);
  const bloqueado = numeroVazio || !!conflitoSlot;

  function submit() {
    setTentouSalvar(true);
    if (bloqueado || saving) return;
    onSubmit({
      locker: { ...normalizado, id: initial.id, updatedAt: Date.now() },
      liberar: liberarAnterior ? ocupanteEmOutros : [],
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Editar armário ${initial.numero}` : "Novo armário"}</DialogTitle>
          <DialogDescription>
            Os dados são padronizados automaticamente ao salvar (grafia, caixa e numeração).
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div>
            <Label className="mb-1.5 block text-xs">Vestiário</Label>
            <Select value={normalizado.vestiario} onValueChange={(v) => set({ vestiario: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {unique([...opcoes.vestiarios, normalizado.vestiario]).map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="locker-local" className="mb-1.5 block text-xs">
              Local
            </Label>
            <Input
              id="locker-local"
              list="locker-locais"
              value={form.localizacao}
              onChange={(e) => set({ localizacao: e.target.value })}
              placeholder="Vestiário / Corredor Externo"
            />
            <datalist id="locker-locais">
              {opcoes.locais.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </div>
          <div>
            <Label htmlFor="locker-numero" className="mb-1.5 block text-xs">
              Número *
            </Label>
            <Input
              id="locker-numero"
              autoFocus={!isEdit}
              inputMode="numeric"
              value={form.numero}
              onChange={(e) => set({ numero: e.target.value })}
              placeholder="229"
              aria-invalid={tentouSalvar && bloqueado}
            />
            {tentouSalvar && numeroVazio && (
              <p className="mt-1 text-xs text-destructive">Informe o número do armário.</p>
            )}
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">Situação</Label>
            <Select
              value={situacaoValue}
              onValueChange={(v) => set({ situacao: v === SEM_PENDENCIA ? "" : v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_PENDENCIA}>Sem pendência</SelectItem>
                {situacoes.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.charAt(0) + s.slice(1).toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="locker-ocupante" className="mb-1.5 block text-xs">
              Ocupante
            </Label>
            <Input
              id="locker-ocupante"
              autoFocus={isEdit}
              value={form.ocupante}
              onChange={(e) => set({ ocupante: e.target.value })}
              placeholder="Deixe vazio se o armário estiver livre"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="locker-setor" className="mb-1.5 block text-xs">
              Setor
            </Label>
            <Input
              id="locker-setor"
              list="locker-setores"
              value={form.setor}
              onChange={(e) => set({ setor: e.target.value })}
              placeholder="Ex.: PRODUÇÃO"
            />
            <datalist id="locker-setores">
              {opcoes.setores.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </div>

          {conflitoSlot && (
            <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive sm:col-span-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                O armário {conflitoSlot.numero} ({conflitoSlot.localizacao},{" "}
                {conflitoSlot.vestiario}) já está cadastrado
                {conflitoSlot.ocupante ? ` para ${conflitoSlot.ocupante}` : " como livre"}. Edite o
                registro existente em vez de criar outro.
              </span>
            </div>
          )}

          {ocupanteEmOutros.length > 0 && (
            <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm sm:col-span-2">
              <p className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  {normalizado.ocupante} já ocupa o(s) armário(s){" "}
                  <strong>
                    {ocupanteEmOutros.map((l) => `${l.numero} (${l.localizacao})`).join(", ")}
                  </strong>
                  .
                </span>
              </p>
              <label className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={liberarAnterior}
                  onCheckedChange={(v) => setLiberarAnterior(v === true)}
                />
                Transferir: liberar o armário anterior ao salvar
              </label>
            </div>
          )}

          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || (tentouSalvar && bloqueado)}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
