import type { Colaborador } from "./certificate-template";
import { maskCPF, isValidCPF } from "./cpf";

export const normalizedName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
const digits = (cpf: string) => cpf.replace(/\D/g, "");

/** Separa um CPF que tenha sido colado no final do campo de nome. */
export function normalizeCollaboratorIdentity(c: Colaborador): Colaborador {
  const nome = c.nome.trim();
  const embeddedCpf = nome.match(
    /(?:\s+|^)(?:CPF\s*:?\s*)?(\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2})\s*$/i,
  );
  if (!embeddedCpf) return { ...c, nome, cpf: maskCPF(c.cpf) };

  const cleanName = nome.slice(0, embeddedCpf.index).trim();
  return {
    ...c,
    nome: cleanName,
    cpf: maskCPF(c.cpf.trim() || embeddedCpf[1]),
  };
}

/** Duplicates are linked by either CPF or name; blank names/CPFs never create false matches. */
export function duplicateIndices(cols: Colaborador[]): Set<number> {
  const cpfs = new Map<string, number>();
  const names = new Map<string, number>();
  const duplicates = new Set<number>();
  cols.forEach((c, i) => {
    const cpf = digits(c.cpf),
      name = normalizedName(c.nome);
    if (cpf && cpfs.has(cpf)) duplicates.add(i);
    if (name && names.has(name)) duplicates.add(i);
    if (cpf && !cpfs.has(cpf)) cpfs.set(cpf, i);
    if (name && !names.has(name)) names.set(name, i);
  });
  return duplicates;
}

export function prepareCollaborators(cols: Colaborador[]) {
  const seenCpf = new Set<string>(),
    seenName = new Map<string, string>();
  const kept: Colaborador[] = [];
  let reformatted = 0,
    removed = 0,
    conflicts = 0;
  for (const c of cols) {
    const normalized = normalizeCollaboratorIdentity(c);
    const cpf = normalized.cpf;
    if (cpf !== c.cpf || normalized.nome !== c.nome.trim()) reformatted++;
    const key = digits(cpf),
      name = normalizedName(normalized.nome);
    if (key && seenCpf.has(key)) {
      removed++;
      continue;
    }
    const previousCpf = name ? seenName.get(name) : undefined;
    // Identical names with distinct valid CPFs may be different people: retain for review.
    if (previousCpf !== undefined && key && previousCpf && key !== previousCpf) {
      conflicts++;
    } else if (previousCpf !== undefined) {
      removed++;
      continue;
    }
    if (key) seenCpf.add(key);
    if (name && !seenName.has(name)) seenName.set(name, key);
    kept.push(normalized);
  }
  const missingCpf = kept.filter((c) => c.nome.trim() && !c.cpf.trim()).length;
  const invalidCpf = kept.filter((c) => c.cpf.trim() && !isValidCPF(c.cpf)).length;
  const missingName = kept.filter((c) => !c.nome.trim() && c.cpf.trim()).length;
  return {
    cols: kept.length ? kept : [{ nome: "", cpf: "" }],
    reformatted,
    removed,
    conflicts,
    missingCpf,
    invalidCpf,
    missingName,
  };
}
