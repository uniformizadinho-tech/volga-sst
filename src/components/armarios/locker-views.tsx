import { DoorOpen, Pencil, Trash2, UserMinus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { hasPendencia, isOcupado, type Locker } from "@/lib/lockers-domain";

export type LockerStatus = "ocupado" | "livre";

export function lockerStatus(l: Locker): LockerStatus {
  return isOcupado(l) ? "ocupado" : "livre";
}

export const STATUS_STYLES: Record<
  LockerStatus,
  { border: string; dot: string; badge: string; label: string }
> = {
  ocupado: {
    border: "border-l-4 border-l-blue-600",
    dot: "bg-blue-600",
    badge: "bg-blue-600/15 text-blue-700",
    label: "Ocupado",
  },
  livre: {
    border: "border-l-4 border-l-emerald-500",
    dot: "bg-accent",
    badge: "bg-accent/15 text-accent dark:text-accent",
    label: "Livre",
  },
};

export function PendenciaBadge({ situacao }: { situacao: string }) {
  if (!situacao) return null;
  return (
    <span className="whitespace-nowrap rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium uppercase text-destructive">
      {situacao}
    </span>
  );
}

export function StatusBadge({ locker }: { locker: Locker }) {
  const s = STATUS_STYLES[lockerStatus(locker)];
  return (
    <span
      className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${s.badge}`}
    >
      {s.label}
    </span>
  );
}

interface ViewProps {
  lockers: Locker[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleAll: (ids: string[], select: boolean) => void;
  onEdit: (l: Locker) => void;
  onRelease: (l: Locker) => void;
  onDelete: (l: Locker) => void;
  flaggedIds: Set<string>;
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border bg-white px-4 py-3 text-xs text-muted-foreground">
      <span className="font-medium">Legenda:</span>
      {(Object.keys(STATUS_STYLES) as LockerStatus[]).map((key) => (
        <span key={key} className="flex items-center gap-1.5">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${STATUS_STYLES[key].dot}`} />
          {STATUS_STYLES[key].label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
        Com pendência
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" /> Bloqueado
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full ring-2 ring-amber-500" />
        Inconsistência
      </span>
    </div>
  );
}

function RowActions({
  l,
  onEdit,
  onRelease,
  onDelete,
  size = "h-7 w-7",
}: {
  l: Locker;
  onEdit: (l: Locker) => void;
  onRelease: (l: Locker) => void;
  onDelete: (l: Locker) => void;
  size?: string;
}) {
  return (
    <div className="flex justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        className={size}
        title="Editar"
        aria-label={`Editar armário ${l.numero}`}
        onClick={() => onEdit(l)}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      {isOcupado(l) && (
        <Button
          variant="ghost"
          size="icon"
          className={size}
          title="Liberar armário (remover ocupante)"
          aria-label={`Liberar armário ${l.numero}`}
          onClick={() => onRelease(l)}
        >
          <UserMinus className="h-3.5 w-3.5" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className={`${size} text-destructive hover:text-destructive`}
        title="Excluir"
        aria-label={`Excluir armário ${l.numero}`}
        onClick={() => onDelete(l)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function LockerGrid({
  lockers,
  selectedIds,
  onToggleSelect,
  onEdit,
  onRelease,
  onDelete,
  flaggedIds,
}: ViewProps) {
  return (
    <div>
      <Legend />
      <div className="sst-locker-grid">
        {lockers.map((l) => {
          const checked = selectedIds.has(l.id);
          const flagged = flaggedIds.has(l.id);
          const pending = hasPendencia(l);
          const blocked = /bloquead/i.test(l.situacao);
          const status = blocked
            ? "blocked"
            : pending
              ? "pending"
              : isOcupado(l)
                ? "occupied"
                : "free";
          return (
            <div
              key={l.id}
              className={`sst-locker-tile sst-locker-${status} ${checked ? "is-selected" : ""} ${flagged ? "is-flagged" : ""}`}
              title={`Armário ${l.numero} · ${l.vestiario} · ${l.localizacao} · ${l.ocupante || "Livre"}${pending ? ` · ${l.situacao}` : ""}`}
            >
              <Checkbox
                checked={checked}
                className="sst-tile-checkbox"
                aria-label={`Selecionar armário ${l.numero}`}
                onCheckedChange={() => onToggleSelect(l.id)}
              />
              <button
                type="button"
                className="sst-tile-open"
                onClick={() => onEdit(l)}
                aria-label={`Abrir armário ${l.numero}`}
              >
                <DoorOpen size={18} aria-hidden="true" />
                <strong>{l.numero}</strong>
                <span>
                  {blocked
                    ? "Bloqueado"
                    : pending
                      ? "Pendência"
                      : isOcupado(l)
                        ? "Ocupado"
                        : "Livre"}
                </span>
                {l.ocupante && <small title={l.ocupante}>{l.ocupante}</small>}
              </button>
              <div className="sst-tile-actions">
                <RowActions
                  l={l}
                  onEdit={onEdit}
                  onRelease={onRelease}
                  onDelete={onDelete}
                  size="h-6 w-6"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LockerTable({
  lockers,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  onEdit,
  onRelease,
  onDelete,
  flaggedIds,
}: ViewProps) {
  const ids = lockers.map((l) => l.id);
  const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id));
  const someSelected = !allSelected && ids.some((id) => selectedIds.has(id));
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <Checkbox
              checked={allSelected ? true : someSelected ? "indeterminate" : false}
              aria-label="Selecionar todos os visíveis"
              onCheckedChange={() => onToggleAll(ids, !allSelected)}
            />
          </TableHead>
          <TableHead>Nº</TableHead>
          <TableHead>Local</TableHead>
          <TableHead>Vestiário</TableHead>
          <TableHead>Ocupante</TableHead>
          <TableHead>Setor</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lockers.map((l) => (
          <TableRow
            key={l.id}
            data-state={selectedIds.has(l.id) ? "selected" : undefined}
            className={`transition-colors hover:bg-accent/[0.04] ${flaggedIds.has(l.id) ? "bg-amber-500/[0.06]" : ""}`}
          >
            <TableCell>
              <Checkbox
                checked={selectedIds.has(l.id)}
                aria-label={`Selecionar armário ${l.numero}`}
                onCheckedChange={() => onToggleSelect(l.id)}
              />
            </TableCell>
            <TableCell className="font-semibold">{l.numero}</TableCell>
            <TableCell className="text-muted-foreground">{l.localizacao}</TableCell>
            <TableCell className="text-muted-foreground">{l.vestiario}</TableCell>
            <TableCell>{l.ocupante || <span className="text-muted-foreground">—</span>}</TableCell>
            <TableCell className="text-muted-foreground">{l.setor}</TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                <StatusBadge locker={l} />
                <PendenciaBadge situacao={l.situacao} />
              </div>
            </TableCell>
            <TableCell className="text-right">
              <RowActions
                l={l}
                onEdit={onEdit}
                onRelease={onRelease}
                onDelete={onDelete}
                size="h-8 w-8"
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
