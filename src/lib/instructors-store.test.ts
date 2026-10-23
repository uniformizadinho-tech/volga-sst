import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadInstructors,
  saveInstructors,
  upsertInstructor,
  type SavedInstructor,
} from "./instructors-store";

vi.mock("./shared-kv", () => ({
  pushShared: vi.fn().mockResolvedValue(undefined),
  updateSharedWithRetry: vi.fn().mockResolvedValue("[]"),
}));
vi.mock("sonner", () => ({ toast: { warning: vi.fn() } }));

const instructor: SavedInstructor = {
  id: "inst_test",
  name: "Instrutor teste",
  nome: "Nome completo",
  cargo: "Técnico",
  registro: "123/GO",
  updatedAt: 1,
};

describe("predefinições de instrutores", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("disponibiliza os dois novos instrutores sem remover os existentes", () => {
    const list = loadInstructors();
    expect(list).toHaveLength(5);
    expect(list.find((i) => i.nome === "ISSIS DIAN SILVA")).toMatchObject({
      cargo: "Tec. Segurança do Trabalho",
      registro: "0027575/GO",
    });
    expect(list.find((i) => i.nome === "DANIEL MOREIRA OLIVEIRA")).toMatchObject({
      cargo: "Engenheiro de segurança do trabalho",
      registro: "CEA: 1021141993D/GO",
    });
  });

  it("mantém nome, cargo e registro após salvar e recarregar", () => {
    expect(saveInstructors(upsertInstructor(loadInstructors(), instructor))).toBe(true);
    expect(loadInstructors()).toContainEqual(instructor);
    const updated = { ...instructor, name: "Novo rótulo", registro: "456/GO" };
    expect(saveInstructors(upsertInstructor(loadInstructors(), updated))).toBe(true);
    expect(loadInstructors().filter((i) => i.id === instructor.id)).toEqual([updated]);
  });

  it("preserva instrutores ocultos ao salvar e recarregar", () => {
    const list = loadInstructors().filter((i) => i.id !== "builtin_inst_issis");
    expect(saveInstructors(list)).toBe(true);
    expect(loadInstructors().some((i) => i.id === "builtin_inst_issis")).toBe(false);
    expect(loadInstructors().some((i) => i.id === "builtin_inst_daniel")).toBe(true);
  });

  it("informa falha quando o navegador bloqueia o salvamento", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Armazenamento bloqueado");
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(saveInstructors([instructor])).toBe(false);
  });
});

describe("mescla de instrutores com a equipe", () => {
  const inst = (id: string, nome: string, updatedAt: number) => ({
    id,
    name: nome,
    nome,
    cargo: "Téc.",
    registro: "1",
    updatedAt,
  });

  it("mantém instrutores que outra pessoa cadastrou", async () => {
    const { mesclarInstrutores } = await import("./instructors-store");
    const out = mesclarInstrutores([inst("a", "Colega", 5)], [inst("b", "Meu", 6)], new Set());
    expect(out.map((i) => i.id).sort()).toEqual(["a", "b"]);
  });

  it("a edição mais recente prevalece", async () => {
    const { mesclarInstrutores } = await import("./instructors-store");
    const out = mesclarInstrutores(
      [inst("a", "Novo nome", 10)],
      [inst("a", "Antigo", 3)],
      new Set(),
    );
    expect(out[0]?.nome).toBe("Novo nome");
  });

  it("respeita exclusões feitas neste navegador", async () => {
    const { mesclarInstrutores } = await import("./instructors-store");
    const out = mesclarInstrutores([inst("a", "X", 1), inst("b", "Y", 1)], [], new Set(["a"]));
    expect(out.map((i) => i.id)).toEqual(["b"]);
  });

  it("ocultos: aplica só o que mudou", async () => {
    const { mesclarOcultos } = await import("./instructors-store");
    expect(mesclarOcultos(["x", "y"], ["z"], ["x"]).sort()).toEqual(["y", "z"]);
  });
});
