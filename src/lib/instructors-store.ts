import {
  BUILTIN_INSTRUCTORS,
  isBuiltInInstructorId,
  stripBuiltInInstructors,
  withBuiltInInstructors,
} from "./builtin-instructors";
import { toast } from "sonner";
import { updateSharedWithRetry } from "./shared-kv";

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

function parseArray<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

let avisouFalha = false;
function avisarFalhaNuvem(err: unknown): void {
  console.error("Instrutores: alteração salva neste navegador, mas não na nuvem.", err);
  if (avisouFalha) return;
  avisouFalha = true;
  toast.warning(
    "Instrutores salvos neste navegador, mas não sincronizados com a equipe. Verifique a conexão.",
  );
}

/**
 * Aplica as mudanças deste navegador sobre a versão da nuvem, em vez de substituí-la:
 * quem editou cada instrutor por último prevalece e exclusões são respeitadas.
 */
export function mesclarInstrutores(
  remoto: SavedInstructor[],
  local: SavedInstructor[],
  excluidos: Set<string>,
): SavedInstructor[] {
  const porId = new Map(remoto.map((i) => [i.id, i]));
  for (const inst of local) {
    const atual = porId.get(inst.id);
    if (!atual || (inst.updatedAt ?? 0) >= (atual.updatedAt ?? 0)) porId.set(inst.id, inst);
  }
  for (const id of excluidos) porId.delete(id);
  return [...porId.values()];
}

/** Ocultos = conjunto: aplica só o que foi adicionado/removido neste navegador. */
export function mesclarOcultos(
  remoto: string[],
  adicionados: string[],
  removidos: string[],
): string[] {
  const set = new Set(remoto);
  adicionados.forEach((id) => set.add(id));
  removidos.forEach((id) => set.delete(id));
  return [...set];
}

function saveHiddenBuiltIns(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    const antes = new Set(parseArray<string>(window.localStorage.getItem(HIDDEN_KEY)));
    const depois = new Set(ids);
    const adicionados = ids.filter((id) => !antes.has(id));
    const removidos = [...antes].filter((id) => !depois.has(id));
    window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids));
    if (!adicionados.length && !removidos.length) return;
    updateSharedWithRetry(HIDDEN_KEY, (remoto) =>
      JSON.stringify(mesclarOcultos(parseArray<string>(remoto), adicionados, removidos)),
    ).catch(avisarFalhaNuvem);
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

    const proprios = stripBuiltInInstructors(list);
    const anteriores = parseArray<SavedInstructor>(window.localStorage.getItem(KEY));
    const idsAgora = new Set(proprios.map((i) => i.id));
    const excluidos = new Set(anteriores.map((i) => i.id).filter((id) => !idsAgora.has(id)));
    window.localStorage.setItem(KEY, JSON.stringify(proprios));
    updateSharedWithRetry(KEY, (remoto) =>
      JSON.stringify(mesclarInstrutores(parseArray<SavedInstructor>(remoto), proprios, excluidos)),
    ).catch(avisarFalhaNuvem);
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
