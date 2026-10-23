import { createBackup, type BackupEnvelope } from "./backup";

export const BACKUP_STATE_KEYS = [
  "volga:inspecoes:v1",
  "volga:training-matrix:v1",
  "volga:cert-history:v1",
  "volga:cert-instructors:v1",
  "volga:cert-instructors-hidden:v1",
  "volga:cert-templates:v1",
  "volga:validades-janela:v1",
  "volga:estoque-itens:v2",
  "volga:estoque-lancamentos:v2",
  "volga:lockers-cache:v1",
] as const;

export type BackupStateKey = (typeof BACKUP_STATE_KEYS)[number];

export function collectLocalState(
  storage: Storage | undefined = typeof window === "undefined" ? undefined : window.localStorage,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (!storage) return data;
  for (const key of BACKUP_STATE_KEYS) {
    const raw = storage.getItem(key);
    if (!raw) continue;
    try {
      data[key] = JSON.parse(raw);
    } catch {
      data[key] = { formato: "texto", valor: raw };
    }
  }
  return data;
}

export function createFullLocalBackup(
  storage: Storage | undefined = typeof window === "undefined" ? undefined : window.localStorage,
  origem: BackupEnvelope["origem"] = "dispositivo",
): BackupEnvelope {
  return createBackup({ estadoLocal: collectLocalState(storage) }, origem);
}

export function stateFromBackup(backup: BackupEnvelope): Record<string, unknown> {
  const state = backup.dados.estadoLocal;
  if (!state || typeof state !== "object" || Array.isArray(state))
    throw new Error("O backup não contém o snapshot local esperado.");
  return state as Record<string, unknown>;
}

export function restoreLocalState(
  state: Record<string, unknown>,
  storage: Storage | undefined = typeof window === "undefined" ? undefined : window.localStorage,
): number {
  if (!storage) throw new Error("A restauração precisa ser executada no navegador.");
  let restored = 0;
  for (const key of BACKUP_STATE_KEYS) {
    if (!(key in state)) continue;
    storage.setItem(key, JSON.stringify(state[key]));
    restored += 1;
  }
  return restored;
}
