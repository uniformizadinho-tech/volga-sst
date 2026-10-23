import {
  BUILTIN_INSTRUCTORS,
  isBuiltInInstructorId,
  stripBuiltInInstructors,
  withBuiltInInstructors,
} from "./builtin-instructors";
import { pushShared } from "./shared-kv";

export { isBuiltInInstructorId } from "./builtin-instructors";

export interface SavedInstructor {
  id: string;
  /** Rótulo curto exibido no seletor (pode ser igual a `nome`). */
  name: string;
  nome: string;
  cargo: string;
  registro: string;
  updatedAt: number;
}

const KEY = "volga:cert-instructors:v1";
const HIDDEN_KEY = "volga:cert-instructors-hidden:v1";

function loadHiddenBuiltIns(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HIDDEN_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function saveHiddenBuiltIns(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    const v = JSON.stringify(ids);
    window.localStorage.setItem(HIDDEN_KEY, v);
    void pushShared(HIDDEN_KEY, v);
  } catch (err) {
    console.error("Falha ao salvar instrutores ocultos:", err);
  }
}

function applyHidden(list: SavedInstructor[]): SavedInstructor[] {
  const hidden = new Set(loadHiddenBuiltIns());
  return list.filter((i) => !hidden.has(i.id));
}

export function loadInstructors(): SavedInstructor[] {
  if (typeof window === "undefined") return applyHidden(withBuiltInInstructors([]));
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return applyHidden(withBuiltInInstructors([]));
    const parsed = JSON.parse(raw) as SavedInstructor[];
    if (!Array.isArray(parsed)) return applyHidden(withBuiltInInstructors([]));
    return applyHidden(withBuiltInInstructors(stripBuiltInInstructors(parsed)));
  } catch {
    return applyHidden(withBuiltInInstructors([]));
  }
}

export function saveInstructors(list: SavedInstructor[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    // Atualiza a lista de built-ins ocultos com base nos que sumiram da lista.
    const presentBuiltInIds = new Set(
      list.filter((i) => isBuiltInInstructorId(i.id)).map((i) => i.id),
    );
    const hidden = BUILTIN_INSTRUCTORS.filter((b) => !presentBuiltInIds.has(b.id)).map((b) => b.id);
    saveHiddenBuiltIns(hidden);

    const v = JSON.stringify(stripBuiltInInstructors(list));
    window.localStorage.setItem(KEY, v);
    void pushShared(KEY, v);
    return true;
  } catch (err) {
    console.error("Falha ao salvar instrutores no localStorage:", err);
    return false;
  }
}

export function newInstructorId(): string {
  return `inst_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function upsertInstructor(
  list: SavedInstructor[],
  inst: SavedInstructor,
): SavedInstructor[] {
  const idx = list.findIndex((i) => i.id === inst.id);
  const next = [...list];
  if (idx >= 0) next[idx] = inst;
  else next.push(inst);
  return next;
}

export function removeInstructor(list: SavedInstructor[], id: string): SavedInstructor[] {
  return list.filter((i) => i.id !== id);
}

export function renameInstructor(
  list: SavedInstructor[],
  id: string,
  name: string,
): SavedInstructor[] {
  return list.map((i) => (i.id === id ? { ...i, name, updatedAt: Date.now() } : i));
}

export { BUILTIN_INSTRUCTORS };
