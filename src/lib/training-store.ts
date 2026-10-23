import { supabase } from "./supabase";
import {
  emptyTrainingState,
  TRAINING_LABELS,
  TRAINING_NRS,
  type TrainingState,
} from "./training-matrix";

const KEY = "volga:training-matrix:v1";
export interface TrainingSnapshot {
  state: TrainingState;
  revision: string | null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertTrainingState(value: unknown): TrainingState {
  if (!isObject(value) || !Array.isArray(value.records) || !isObject(value.links)) {
    throw new Error("Os registros de treinamentos precisam de revisão.");
  }
  const validRecords = value.records.every((record) => {
    if (!isObject(record)) return false;
    return (
      typeof record.id === "string" &&
      typeof record.origin === "string" &&
      typeof record.name === "string" &&
      typeof record.sheet === "string" &&
      typeof record.row === "number" &&
      Number.isInteger(record.row) &&
      TRAINING_NRS.includes(record.nr as (typeof TRAINING_NRS)[number]) &&
      Array.isArray(record.dates) &&
      record.dates.every((date) => typeof date === "string") &&
      typeof record.status === "string" &&
      Object.prototype.hasOwnProperty.call(TRAINING_LABELS, record.status)
    );
  });
  const validLinks = Object.entries(value.links).every(
    ([origin, group]) => typeof origin === "string" && typeof group === "string",
  );
  if (!validRecords || !validLinks) {
    throw new Error("Os registros de treinamentos precisam de revisão.");
  }
  return value as unknown as TrainingState;
}

export function parseTrainingState(value: string): TrainingState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error("A Matriz compartilhada está corrompida. Solicite uma nova importação.");
  }
  return assertTrainingState(parsed);
}

export async function loadTrainingState(): Promise<TrainingSnapshot> {
  const { data, error } = await supabase
    .from("app_shared_state")
    .select("value, updated_at")
    .eq("key", KEY)
    .maybeSingle();
  if (error) throw new Error("Não foi possível carregar os treinamentos. Tente novamente.");
  if (!data) return { state: emptyTrainingState(), revision: null };
  const state = parseTrainingState(data.value);
  return { state, revision: data.updated_at };
}
/** Remove todos os registros importados da Matriz, na nuvem e no cache local. */
export async function clearTrainingState(): Promise<void> {
  const { error } = await supabase.from("app_shared_state").delete().eq("key", KEY);
  if (error)
    throw new Error(
      "Não foi possível apagar os registros. Verifique se seu perfil permite a gravação e tente novamente.",
    );
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Cache local indisponível; a nuvem já foi limpa.
  }
}

export async function saveTrainingState(
  state: TrainingState,
  revision: string | null,
): Promise<TrainingSnapshot> {
  assertTrainingState(state);
  const updated_at = new Date().toISOString();
  const value = JSON.stringify(state);
  const query = revision
    ? supabase
        .from("app_shared_state")
        .update({ value, updated_at })
        .eq("key", KEY)
        .eq("updated_at", revision)
    : supabase.from("app_shared_state").insert({ key: KEY, value, updated_at });
  const { data, error } = await query.select("updated_at").single();
  if (error || !data)
    throw new Error(
      "Não foi possível salvar. Outra pessoa pode ter alterado a matriz ou seu perfil não permite a gravação. Recarregue e tente novamente.",
    );
  return { state, revision: data.updated_at };
}
