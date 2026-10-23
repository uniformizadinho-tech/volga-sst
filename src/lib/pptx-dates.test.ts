import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import PizZip from "pizzip";
import { replaceDatesInSlideXml } from "./pptx-dates";

const dir = "public/templates/originals";
describe("troca de datas nos modelos originais", () => {
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".pptx"))) {
    it(f, () => {
      const zip = new PizZip(readFileSync(`${dir}/${f}`));
      const all = Object.keys(zip.files)
        .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
        .map((n) => replaceDatesInSlideXml(zip.file(n)!.asText(), "05/10/2026"))
        .join("");
      const text = [...all.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join("");
      expect(text).not.toMatch(/\b(?:20(?:2[3-5])|2026)\b(?<!\/10\/2026)(?<! de 2026)/);
      expect(text).toMatch(/05\/10\/2026|05 de [Oo]utubro de 2026/);
    });
  }
  it("une runs separados", () => {
    const x =
      "<a:p><a:r><a:t>Em 12</a:t></a:r><a:r><a:t>/06/2026 à 14/06/2026 ok</a:t></a:r></a:p>";
    expect(replaceDatesInSlideXml(x, "05/10/2026")).toBe(
      "<a:p><a:r><a:t>Em 05/10/2026</a:t></a:r><a:r><a:t> ok</a:t></a:r></a:p>",
    );
  });
});
