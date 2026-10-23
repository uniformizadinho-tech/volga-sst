import { describe, expect, it } from "vitest";
import {
  patchInstructorBlocks,
  patchInstructorLabelBody,
  preventWrap,
  normalizeSignatureLineBreaks,
  stabilizeSignatureNameBodies,
} from "./generate-pptx";
import { DEFAULT_SHARED, type SharedFields } from "./certificate-template";

// XML sintético reproduzindo a estrutura real encontrada nos modelos com 2
// assinaturas de instrutor (coluna do meio = engenheiro/CREA, coluna da
// direita = técnico/Reg). Serve para validar a lógica de string-replace sem
// precisar montar um .pptx completo.
function signatureBlock(nome: string, cargo: string, regLabel: "REG" | "CREA", regValor: string) {
  return (
    `<p:sp><p:txBody><a:bodyPr lIns="90000" rIns="90000" tIns="45000" bIns="45000" anchor="t"><a:spAutoFit/></a:bodyPr>` +
    `<a:p><a:r><a:t>${nome}</a:t></a:r></a:p></p:txBody></p:sp>` +
    `<p:sp><p:txBody><a:bodyPr anchor="t"><a:spAutoFit/></a:bodyPr>` +
    `<a:p><a:r><a:t>Instrutor/Respons\u00e1vel T\u00e9cnico</a:t></a:r></a:p>` +
    `<a:p><a:r><a:t>${cargo}</a:t></a:r></a:p>` +
    `<a:p><a:r><a:t>${regLabel}: ${regValor}</a:t></a:r></a:p></p:txBody></p:sp>`
  );
}

function shared(overrides: Partial<SharedFields>): SharedFields {
  return { ...DEFAULT_SHARED, ...overrides };
}

describe("preventWrap", () => {
  it("adiciona wrap=none a um bodyPr sem esse atributo (com filhos)", () => {
    const xml = '<a:bodyPr anchor="t"><a:spAutoFit/></a:bodyPr>';
    const out = preventWrap(xml);
    expect(out).toContain('wrap="none"');
    expect(out).toContain("<a:normAutofit");
  });

  it("adiciona wrap=none a um bodyPr autofechado", () => {
    const xml = '<a:bodyPr lIns="0" rIns="0"/>';
    const out = preventWrap(xml);
    expect(out).toContain('wrap="none"');
    expect(out.trim().endsWith("/>")).toBe(true);
  });

  it("substitui wrap existente em vez de duplicar", () => {
    const xml = '<a:bodyPr wrap="square" anchor="t">';
    const out = preventWrap(xml);
    expect(out.match(/wrap=/g)).toHaveLength(1);
    expect(out).toContain('wrap="none"');
  });

  it("mantém a caixa fixa e troca crescimento por redução automática", () => {
    const xml = '<a:bodyPr anchor="t"><a:spAutoFit/></a:bodyPr>';
    const out = preventWrap(xml);
    expect(out).not.toContain("<a:spAutoFit/>");
    expect(out).toContain('<a:normAutofit fontScale="100000" lnSpcReduction="0"/>');
  });
});

describe("stabilizeSignatureNameBodies", () => {
  it("protege apenas a caixa do nome, mesmo quando há sublinhados", () => {
    const signature =
      "<p:txBody><a:bodyPr><a:spAutoFit/></a:bodyPr><a:p><a:r><a:t>____________________ Hervinio Tomaz Da Rocha Sobrinho</a:t></a:r></a:p></p:txBody>";
    const cargo =
      "<p:txBody><a:bodyPr><a:spAutoFit/></a:bodyPr><a:p><a:r><a:t>Téc. Segurança do Trabalho</a:t></a:r></a:p></p:txBody>";
    const out = stabilizeSignatureNameBodies(signature + cargo, [
      "Hervinio Tomaz Da Rocha Sobrinho",
    ]);
    expect(out.match(/wrap="none"/g)).toHaveLength(1);
    expect(out.match(/<a:normAutofit/g)).toHaveLength(1);
    expect(out).toContain("<a:t>Téc. Segurança do Trabalho</a:t>");
  });
});

describe("normalizeSignatureLineBreaks", () => {
  it("separa linha e nome quando vieram no mesmo parágrafo", () => {
    const xml =
      '<p:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="1400"/><a:t>____________________ </a:t></a:r><a:r><a:t> </a:t></a:r><a:r><a:rPr sz="1100"/><a:t>Jose Maria da Silva Neto</a:t></a:r></a:p></p:txBody>';
    const out = normalizeSignatureLineBreaks(xml);
    expect(out).toMatch(/_{5,}[\s\S]*?<a:br><a:rPr sz="1400"\/><\/a:br>[\s\S]*Jose Maria/);
  });

  it("não duplica a quebra de uma assinatura já correta", () => {
    const xml =
      '<p:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="1200"/><a:t>____________________</a:t></a:r><a:br><a:rPr sz="1200"/></a:br><a:r><a:t>Jose Maria da Silva Neto</a:t></a:r></a:p></p:txBody>';
    expect(normalizeSignatureLineBreaks(xml)).toBe(xml);
  });
});

describe("patchInstructorLabelBody", () => {
  it('atualiza o n\u00famero quando o r\u00f3tulo \u00e9 "Reg:", preservando o r\u00f3tulo', () => {
    const body = signatureBlock(
      "Nome Antigo",
      "T\u00e9c. Seguran\u00e7a do Trabalho",
      "REG",
      "0000/GO",
    ).split("</p:sp><p:sp>")[1];
    const patched = patchInstructorLabelBody(
      `<p:sp>${body}`,
      shared({ instrutorRegistro: "9999/GO" }),
    );
    expect(patched).toContain("Reg: 9999/GO");
  });

  it('atualiza o n\u00famero quando o r\u00f3tulo \u00e9 "CREA:", preservando o r\u00f3tulo CREA (bug corrigido)', () => {
    const body = signatureBlock(
      "Nome Antigo",
      "Engenheira Eletricista",
      "CREA",
      "1005168679D/GO",
    ).split("</p:sp><p:sp>")[1];
    const patched = patchInstructorLabelBody(
      `<p:sp>${body}`,
      shared({ instrutorRegistro: "1234567D/GO" }),
    );
    expect(patched).toContain("CREA: 1234567D/GO");
    expect(patched).not.toContain("1005168679D/GO");
  });
});

describe("patchInstructorBlocks (assinatura do meio)", () => {
  it("sem instrutor do meio: os dois blocos recebem o mesmo instrutor (comportamento antigo preservado)", () => {
    const xml =
      signatureBlock("Original Um", "Engenheira Eletricista", "CREA", "111/GO") +
      signatureBlock("Original Dois", "T\u00e9c. Seguran\u00e7a do Trabalho", "REG", "222/GO");
    const out = patchInstructorBlocks(
      xml,
      shared({ instrutorNome: "Fulano da Silva", instrutorRegistro: "999/GO" }),
    );
    expect(out.match(/Fulano da Silva/g)?.length).toBe(2);
  });

  it("com instrutor do meio: primeiro bloco usa o instrutor do meio, o segundo usa o principal", () => {
    const xml =
      signatureBlock("Original Um", "Engenheira Eletricista", "CREA", "111/GO") +
      signatureBlock("Original Dois", "T\u00e9c. Seguran\u00e7a do Trabalho", "REG", "222/GO");
    const out = patchInstructorBlocks(
      xml,
      shared({ instrutorNome: "T\u00e9cnico Principal", instrutorRegistro: "222/GO" }),
      { nome: "Engenheiro Do Meio", cargo: "Engenheiro Eletricista", registro: "333/GO" },
    );
    expect(out).toContain("Engenheiro Do Meio");
    expect(out).toContain("333/GO");
    expect(out).toContain("T\u00e9cnico Principal");
    expect(out).toContain("222/GO");
    expect(out.match(/Engenheiro Do Meio/g)?.length).toBe(1);
  });

  it("nomes longos n\u00e3o deixam wrap= quebrando a caixa (preventWrap aplicado)", () => {
    const xml = signatureBlock(
      "Nome Curto",
      "T\u00e9c. Seguran\u00e7a do Trabalho",
      "REG",
      "222/GO",
    );
    const out = patchInstructorBlocks(
      xml,
      shared({ instrutorNome: "Hervinio Tomaz Da Rocha Sobrinho" }),
    );
    expect(out).toContain('wrap="none"');
  });
  it("edita a coluna central mesmo quando a assinatura da direita vem primeiro no arquivo", () => {
    const shape = (x: number, y: number, text: string) =>
      `<p:sp><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="2600000" cy="300000"/></a:xfrm></p:spPr>` +
      `<p:txBody><a:bodyPr><a:spAutoFit/></a:bodyPr><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
    const xml =
      shape(700000, 6200000, "Nome do Aluno") +
      shape(6600000, 6200000, "Nome da Direita") +
      shape(6500000, 6600000, "Instrutor/Responsável Técnico") +
      shape(3500000, 6200000, "____________________ Nome do Meio") +
      shape(3400000, 6600000, "Responsável Técnico");
    const out = patchInstructorBlocks(xml, shared({ instrutorNome: "Instrutor Principal" }), {
      nome: "Pessoa Central",
      cargo: "Engenheiro",
      registro: "123/GO",
    });
    expect(out).toContain("Nome do Aluno");
    expect(out).toContain("____________________ Pessoa Central");
    expect(out).toContain("Instrutor Principal");
    expect(out).not.toContain("Nome do Meio");
    expect(out).not.toContain("Nome da Direita");
    expect(out).toContain("<a:normAutofit");
  });
});
