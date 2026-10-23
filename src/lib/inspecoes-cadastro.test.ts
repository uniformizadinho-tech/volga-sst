import { describe, expect, it } from "vitest";
import rows from "@/data/extintores-matriz.json";
import {
  adaptarCadastro,
  validarCadastro,
  checklistConferido,
  prazoVencido,
} from "./inspecoes-cadastro";
import { equipamentosDaMatriz, mesclarEquipamentos } from "./inspecoes-planilha";
import { checklistPara } from "./inspecoes-checklist";
import type { Equipamento } from "./inspecoes";

describe("cadastro adaptado", () => {
  it("converte todos os 47 registros e somente as 38 pendências existentes", () => {
    const items = equipamentosDaMatriz(rows);
    expect(items).toHaveLength(47);
    expect(items.flatMap((e) => e.pendencias ?? [])).toHaveLength(38);
    expect(items[0]).toMatchObject({
      tipo: "iluminacao",
      pendencias: [
        {
          nivel: "alto",
          descricao: "Iluminação não funciona na parede de acesso à doca 2",
          situacao: "aberta",
        },
      ],
    });
    expect(items.find((e) => e.codigo === "MATRIZ-003")?.pendencias?.[0]?.nivel).toBe("medio");
    expect(items.every((e) => Object.keys(e.checklistCadastro ?? {}).length === 0)).toBe(true);
  });
  it("mantém pontos mistos sem inventar equipamentos", () => {
    const items = equipamentosDaMatriz(rows);
    expect(items.find((e) => e.codigo === "MATRIZ-004")).toMatchObject({
      tipo: "misto",
      revisaoNecessaria: true,
    });
    expect(items.filter((e) => e.codigo === "MATRIZ-004")).toHaveLength(1);
  });
  it("reimportação não sobrescreve pendência resolvida ou identificação editada", () => {
    const e = equipamentosDaMatriz(rows)[0];
    if (!e || !e.pendencias?.[0]) throw new Error("missing row");
    e.nome = "Luminária doca 2";
    e.pendencias[0] = {
      ...e.pendencias[0],
      situacao: "resolvida",
      correcao: "Luminária substituída",
    };
    const db = adaptarCadastro(
      mesclarEquipamentos({ equipamentos: [e], inspecoes: [] }, equipamentosDaMatriz(rows)),
    );
    expect(db.equipamentos[0]?.nome).toBe("Luminária doca 2");
    expect(db.equipamentos[0]?.pendencias).toHaveLength(1);
    expect(db.equipamentos[0]?.pendencias?.[0]?.situacao).toBe("resolvida");
    expect(db.inspecoes).toHaveLength(0);
  });
  const eq: Equipamento = {
    id: "1",
    codigo: "EX-1",
    nome: "Extintor",
    tipo: "extintor",
    setor: "Produção",
    local: "Porta",
    ativo: true,
    pendencias: [],
    checklistCadastro: {},
  };
  it("novo equipamento exige checklist antes do cadastro", () => {
    expect(validarCadastro(eq, true)).not.toBeNull();
    const completo = {
      ...eq,
      checklistCadastro: Object.fromEntries(
        checklistPara(eq).map((i) => [i.titulo, "ok" as const]),
      ),
    };
    expect(validarCadastro(completo, true)).toBeNull();
  });
  it("falha no checklist exige pendência correspondente com descrição e nível", () => {
    const e = { ...eq, checklistCadastro: { "Lacre intacto": "nc" as const } };
    expect(validarCadastro(e, false)).not.toBeNull();
    expect(
      validarCadastro(
        {
          ...e,
          pendencias: [
            {
              id: "p",
              descricao: "Lacre rompido",
              nivel: "alto",
              acao: "",
              itemChecklist: "Lacre intacto",
              origem: "cadastro",
              situacao: "aberta",
            },
          ],
        },
        false,
      ),
    ).toBeNull();
  });
  it("cadastro novo não aceita uma falha coberta apenas por pendência resolvida", () => {
    const e: Equipamento = {
      ...eq,
      checklistCadastro: Object.fromEntries(
        checklistPara(eq).map((i) => [i.titulo, "ok" as const]),
      ),
      pendencias: [
        {
          id: "p",
          descricao: "Lacre rompido",
          nivel: "alto",
          acao: "",
          origem: "cadastro",
          situacao: "resolvida",
          itemChecklist: "Lacre intacto",
          correcao: "Lacre substituído",
        },
      ],
    };
    e.checklistCadastro = { ...e.checklistCadastro, "Lacre intacto": "nc" };
    expect(validarCadastro(e, true)).not.toBeNull();
  });
  it("cadastro importado sem respostas não é conferido", () => {
    expect(checklistConferido(equipamentosDaMatriz(rows)[0])).toBe(false);
    expect(
      checklistConferido({
        ...eq,
        checklistCadastro: Object.fromEntries(
          checklistPara(eq).map((i) => [i.titulo, "ok" as const]),
        ),
      }),
    ).toBe(true);
  });
  it("prazo anterior a hoje está vencido somente enquanto aberto", () => {
    const p = {
      id: "p",
      descricao: "Lacre",
      nivel: "alto" as const,
      acao: "",
      origem: "cadastro" as const,
      situacao: "aberta" as const,
      prazo: "2026-10-08",
    };
    expect(prazoVencido(p, "2026-10-09")).toBe(true);
    expect(prazoVencido({ ...p, prazo: "2026-10-09" }, "2026-10-09")).toBe(false);
    expect(prazoVencido({ ...p, situacao: "resolvida" }, "2026-10-09")).toBe(false);
  });
  it("resolver pendência exige registrar correção", () => {
    expect(
      validarCadastro(
        {
          ...eq,
          pendencias: [
            {
              id: "p",
              descricao: "Lacre rompido",
              nivel: "baixo",
              acao: "",
              origem: "cadastro",
              situacao: "resolvida",
            },
          ],
        },
        false,
      ),
    ).not.toBeNull();
  });
  it("permite resolver pendência vinculada preservando a resposta original", () => {
    const e: Equipamento = {
      ...eq,
      checklistCadastro: { "Lacre intacto": "nc" },
      pendencias: [
        {
          id: "p",
          descricao: "Lacre rompido",
          nivel: "alto",
          acao: "Manutenção",
          origem: "cadastro",
          situacao: "resolvida",
          itemChecklist: "Lacre intacto",
          correcao: "Lacre substituído",
        },
      ],
    };
    expect(validarCadastro(e, false)).toBeNull();
  });
});
