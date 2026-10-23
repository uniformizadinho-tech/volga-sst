import { describe, expect, it } from "vitest";
import { csvCell, csvRow } from "./csv-safe";

describe("CSV seguro para planilhas", () => {
  it.each(["=", "+", "-", "@", "\t", "\r", "\n"])(
    "neutraliza valores iniciados por %j",
    (prefix) => {
      expect(csvCell(`${prefix}1+1`)).toBe(`"'${prefix}1+1"`);
    },
  );

  it("mantém aspas e separadores dentro do campo", () => {
    expect(csvCell('Silva; "João"')).toBe('"Silva; ""João"""');
  });

  it("serializa uma linha com o separador brasileiro", () => {
    expect(csvRow(["Ana", "=1+1"])).toBe('"Ana";"\'=1+1"');
  });
});
