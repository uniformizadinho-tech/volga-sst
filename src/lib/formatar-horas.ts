/** Tempo restante estimado em texto curto ("~2h05", "~15 min", "concluída"). */
export function formatarHoras(h: number | null): string {
  if (h === null) return "—";
  if (h === 0) return "concluída";
  if (h < 1) return `~${Math.max(1, Math.round(h * 60))} min`;
  const horas = Math.floor(h);
  const min = Math.round((h - horas) * 60);
  return `~${horas}h${min ? String(min).padStart(2, "0") : ""}`;
}
