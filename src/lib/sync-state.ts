export type SyncState = "local" | "loading" | "synced" | "pending" | "conflict" | "error";

export interface SyncMeta {
  state: SyncState;
  source: "device" | "team" | "mixed";
  updatedAt: string | null;
  message?: string;
}

export const SYNC_LABEL: Record<SyncState, string> = {
  local: "Somente neste dispositivo",
  loading: "Carregando dados da equipe",
  synced: "Sincronizado com a equipe",
  pending: "Alteração aguardando confirmação",
  conflict: "Conflito que precisa de revisão",
  error: "Falha na sincronização",
};

export const SYNC_TONE: Record<SyncState, "neutral" | "info" | "success" | "warning" | "danger"> = {
  local: "neutral",
  loading: "info",
  synced: "success",
  pending: "warning",
  conflict: "danger",
  error: "danger",
};

export function syncMeta(
  state: SyncState,
  source: SyncMeta["source"],
  updatedAt: string | null = null,
  message?: string,
): SyncMeta {
  return { state, source, updatedAt, ...(message ? { message } : {}) };
}

export function describeSync(meta: SyncMeta): string {
  const base = SYNC_LABEL[meta.state];
  return meta.message ? `${base}. ${meta.message}` : base;
}
