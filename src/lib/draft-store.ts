import { normalizeShared, type Colaborador, type SharedFields } from "./certificate-template";

const KEY = "volga:cert-draft:v1";

export interface Draft {
  shared: SharedFields;
  cols: Colaborador[];
  savedAt: number;
}

export function loadDraft(): Draft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Draft;
    return { ...parsed, shared: normalizeShared(parsed.shared) };
  } catch {
    return null;
  }
}

export function saveDraft(draft: Omit<Draft, "savedAt">): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {
    // quota — silencioso
  }
}

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
