import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { newLockerId } from "@/lib/lockers-store";
import type { Locker } from "@/lib/lockers-domain";

/**
 * Helpers e cartões de estatística da tela de Armários, extraídos de
 * `src/routes/armarios.tsx` para reduzir o tamanho do arquivo de rota.
 * Nenhuma lógica foi alterada — recorte 1:1 do que já existia.
 */

export function novoRascunho(base?: Partial<Locker>): Locker {
  return {
    id: newLockerId(),
    vestiario: base?.vestiario ?? "Masculino",
    localizacao: base?.localizacao ?? "Vestiário",
    numero: "",
    ocupante: "",
    setor: "",
    situacao: "",
    updatedAt: Date.now(),
  };
}

export function mergeLocal(list: Locker[], changed: Locker[], removedIds: string[] = []): Locker[] {
  const removed = new Set(removedIds);
  const byId = new Map(changed.map((l) => [l.id, l]));
  const next = list.filter((l) => !removed.has(l.id)).map((l) => byId.get(l.id) ?? l);
  const existentes = new Set(list.map((l) => l.id));
  for (const l of changed) if (!existentes.has(l.id)) next.push(l);
  return next;
}

export function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

export function StatCard({
  icon,
  label,
  value,
  hint,
  bar,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
  hint?: string;
  bar: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="sst-stat" aria-pressed={active}>
      <Card className={`sst-stat-card ${active ? "is-active" : ""}`}>
        <span className={`sst-stat-icon ${bar}`}>{icon}</span>
        <span className="sst-stat-body">
          <span className="sst-stat-label">{label}</span>
          <strong>{value}</strong>
          {hint && <span className="sst-stat-hint">{hint}</span>}
        </span>
      </Card>
    </button>
  );
}
