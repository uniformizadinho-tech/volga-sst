// Instrutores fixos (built-in) que sempre aparecem na lista de instrutores
// salvos. Não são persistidos em localStorage nem na nuvem — são injetados
// na lista no carregamento. O usuário pode "Duplicar" para criar uma cópia
// editável, mas os originais permanecem intactos.

import type { SavedInstructor } from "./instructors-store";

const BUILTIN_PREFIX = "builtin_inst_";

export function isBuiltInInstructorId(id: string): boolean {
  return id.startsWith(BUILTIN_PREFIX);
}

export const BUILTIN_INSTRUCTORS: SavedInstructor[] = [
  {
    id: `${BUILTIN_PREFIX}kayque`,
    name: "Kayque Souza De Oliveira",
    nome: "Kayque Souza De Oliveira",
    cargo: "Téc. Segurança do Trabalho",
    registro: "0028038/GO",
    updatedAt: 0,
  },
  {
    id: `${BUILTIN_PREFIX}hervinio`,
    name: "Hervinio Tomaz Da Rocha Sobrinho",
    nome: "Hervinio Tomaz Da Rocha Sobrinho",
    cargo: "Téc. Segurança do Trabalho",
    registro: "002622/GO",
    updatedAt: 0,
  },
  {
    id: `${BUILTIN_PREFIX}leonardo`,
    name: "Leonardo Dos Santos Lima",
    nome: "Leonardo Dos Santos Lima",
    cargo: "Téc. Segurança do Trabalho",
    registro: "0026165/GO",
    updatedAt: 0,
  },
  {
    id: `${BUILTIN_PREFIX}issis`,
    name: "ISSIS DIAN SILVA",
    nome: "ISSIS DIAN SILVA",
    cargo: "Tec. Segurança do Trabalho",
    registro: "0027575/GO",
    updatedAt: 0,
  },
  {
    id: `${BUILTIN_PREFIX}daniel`,
    name: "DANIEL MOREIRA OLIVEIRA",
    nome: "DANIEL MOREIRA OLIVEIRA",
    cargo: "Engenheiro de segurança do trabalho",
    registro: "CEA: 1021141993D/GO",
    updatedAt: 0,
  },
];

export function withBuiltInInstructors(list: SavedInstructor[]): SavedInstructor[] {
  const userOnly = list.filter((i) => !isBuiltInInstructorId(i.id));
  return [...BUILTIN_INSTRUCTORS, ...userOnly];
}

export function stripBuiltInInstructors(list: SavedInstructor[]): SavedInstructor[] {
  return list.filter((i) => !isBuiltInInstructorId(i.id));
}
