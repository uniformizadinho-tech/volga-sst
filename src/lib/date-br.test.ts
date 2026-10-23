import { describe, expect, it } from "vitest";
import { parseDateBR } from "./date-br";

describe("parseDateBR", () => {
  it("aceita dd/mm/yyyy", () => {
    const date = parseDateBR("25/12/2024");
    expect(date?.getFullYear()).toBe(2024);
    expect(date?.getMonth()).toBe(11);
  });

  it("rejeita data inválida", () => {
    expect(parseDateBR("32/13/2024")).toBeUndefined();
  });
});
