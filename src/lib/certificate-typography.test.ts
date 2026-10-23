import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import PizZip from "pizzip";
import { normalizeCertificateTypography } from "./certificate-typography";
import { fitNoWrapBodies, normalizeSignatureLineBreaks } from "./generate-pptx";

const shape = (text: string, y = 6420600) =>
  `<p:sp><p:spPr><a:xfrm><a:off x="6000000" y="${y}"/><a:ext cx="3007800" cy="536400"/></a:xfrm></p:spPr><p:txBody><a:bodyPr wrap="square"><a:spAutoFit/></a:bodyPr><a:p><a:pPr><a:lnSpc><a:spcPct val="130000"/></a:lnSpc></a:pPr><a:r><a:rPr sz="1400" spc="182"><a:latin typeface="Avenir"/></a:rPr><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;

describe("certificate typography", () => {
  it("unifies all signature columns without changing their geometry or text", () => {
    const xml =
      shape("CERTIFICAMOS QUE O COLABORADOR", 2000000) +
      shape("DANIEL MOREIRA OLIVEIRA") +
      shape("ISSIS DIAN SILVA") +
      shape("Marcos Felipe Bispo de Santana");
    const out = normalizeCertificateTypography(xml);
    expect(out.match(/sz="1200"/g)).toHaveLength(3);
    expect(out).not.toContain('typeface="Avenir"');
    expect(out.match(/<a:off[^>]*\/>/g)).toEqual(xml.match(/<a:off[^>]*\/>/g));
    expect(out).toContain('spc="0"');
    expect(out).not.toContain("spAutoFit");
  });
  it("uses compact zero-tracking labels and retains long names with fitting", () => {
    const xml =
      shape("CERTIFICAMOS QUE O COLABORADOR", 2000000) +
      shape("Instrutor/Responsável Técnico") +
      shape("Nome de Colaborador Extremamente Longo para Verificação de Ajuste");
    const out = fitNoWrapBodies(normalizeCertificateTypography(xml));
    expect(out).toContain('sz="1100"');
    expect(out).toContain('wrap="none"');
    expect(out).toContain("Nome de Colaborador Extremamente Longo para Verificação de Ajuste");
  });
  it("is stable across repeated normalization", () => {
    const first = normalizeCertificateTypography(shape("Instrutor"));
    expect(normalizeCertificateTypography(first)).toBe(first);
  });
  const files = [
    "public/templates/certificado-volga-nr06.pptx",
    ...readdirSync("public/templates/originals")
      .filter((name) => name.endsWith(".pptx"))
      .map((name) => `public/templates/originals/${name}`),
  ];
  for (const path of files) {
    it(`preserves every text and shape position in ${path}`, () => {
      const zip = new PizZip(readFileSync(path));
      for (const name of Object.keys(zip.files).filter((name) =>
        /^ppt\/slides\/slide\d+\.xml$/.test(name),
      )) {
        const before = zip.file(name)?.asText();
        if (!before) continue;
        const out = fitNoWrapBodies(
          normalizeCertificateTypography(normalizeSignatureLineBreaks(before)),
        );
        expect(out.match(/<a:t>[\s\S]*?<\/a:t>/g)).toEqual(before.match(/<a:t>[\s\S]*?<\/a:t>/g));
        expect(out.match(/<a:(?:off|ext)\b[^>]*\/>/g)).toEqual(
          before.match(/<a:(?:off|ext)\b[^>]*\/>/g),
        );
        expect(out).not.toMatch(/<a:(?:rPr|defRPr|endParaRPr)\b[^>]*\bspc="(?!0")/);
      }
    });
  }
});
