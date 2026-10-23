import { describe, expect, it } from "vitest";
import { parseBulkText } from "./colaboradores-io";

describe("parseBulkText", () => {
  it("parse básico", () => {
    const out = parseBulkText("João\t11144477735");
    expect(out.length).toBeGreaterThan(0);
  });
});
