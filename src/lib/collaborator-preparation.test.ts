import { describe, expect, it } from "vitest";
import {
  duplicateIndices,
  normalizeCollaboratorIdentity,
  prepareCollaborators,
} from "./collaborator-preparation";

const item = (nome: string, cpf: string) => ({ nome, cpf });

describe("preparação de colaboradores", () => {
  it("formata CPF, remove repetição por CPF mesmo com outro nome", () => {
    const res = prepareCollaborators([
      item("Ana", "52998224725"),
      item("Ana Maria", "529.982.247-25"),
    ]);
    expect(res.removed).toBe(1);
    expect(res.cols[0].cpf).toBe("529.982.247-25");
  });
  it("identifica nomes equivalentes sem acento e caixa e ignora campos vazios", () => {
    const rows = [
      item("João da Silva", ""),
      item("JOAO  DA SILVA", ""),
      item("", ""),
      item("", ""),
    ];
    expect([...duplicateIndices(rows)]).toEqual([1]);
    expect(prepareCollaborators(rows).removed).toBe(1);
  });
  it("mantém homônimos com CPFs diferentes para revisão, sem perda de dados", () => {
    const res = prepareCollaborators([item("João", "52998224725"), item("JOAO", "11144477735")]);
    expect(res.removed).toBe(0);
    expect(res.conflicts).toBe(1);
    expect(res.cols).toHaveLength(2);
    expect([...duplicateIndices(res.cols)]).toEqual([1]);
  });
  it("resumirá CPFs ausentes, inválidos e nomes faltantes", () => {
    const res = prepareCollaborators([item("A", ""), item("B", "123"), item("", "52998224725")]);
    expect([res.missingCpf, res.invalidCpf, res.missingName]).toEqual([1, 1, 1]);
  });
  it("separa o CPF colado no final do nome", () => {
    expect(
      normalizeCollaboratorIdentity(item("Ismael Firmino Rodrigues 704.505.891-88", "")),
    ).toEqual({
      nome: "Ismael Firmino Rodrigues",
      cpf: "704.505.891-88",
    });
  });
});
