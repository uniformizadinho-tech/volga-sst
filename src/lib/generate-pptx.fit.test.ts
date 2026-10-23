import { describe, expect, it } from "vitest";
import { fitNoWrapBodies } from "./generate-pptx";

const shape = (text: string, wrap = ' wrap="none"') =>
  `<p:sp><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2579400" cy="400000"/></a:xfrm></p:spPr>` +
  `<p:txBody><a:bodyPr lIns="90000" rIns="90000"${wrap}/><a:p><a:r><a:rPr b="1" sz="1400"/><a:t>__________</a:t></a:r><a:br><a:rPr sz="1400"/></a:br>` +
  `<a:r><a:rPr b="1" sz="1400"/><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;

describe("fitNoWrapBodies", () => {
  it("reduz só a linha do nome longo, mantendo os sublinhados", () => {
    const out = fitNoWrapBodies(shape("Mariana Aparecida Fernandesaaaaaaaaaa"));
    const sizes = [...out.matchAll(/<a:rPr b="1" sz="(\d+)"/g)].map((m) => Number(m[1]));
    expect(sizes[0]).toBe(1400);
    expect(sizes[1]).toBeLessThan(1400);
  });
  it("não altera nomes curtos nem caixas com quebra", () => {
    expect(fitNoWrapBodies(shape("Ana Lima"))).toBe(shape("Ana Lima"));
    const wrapped = shape("Nome Muito Muito Muito Muito Longo Demais", "");
    expect(fitNoWrapBodies(wrapped)).toBe(wrapped);
  });
});
