import { describe, expect, it } from "vitest";
import { can, explainDenied } from "./permissions";

describe("permissões de exames ocupacionais", () => {
  it("permite somente administrador, SESMT e RH", () => {
    for (const role of ["admin", "sesmt", "rh"] as const) {
      expect(can(role, "exames.read")).toBe(true);
      expect(can(role, "exames.write")).toBe(true);
    }
    expect(can("almoxarifado", "exames.read")).toBe(false);
    expect(can("leitor", "exames.read")).toBe(false);
  });

  it("explica por que o acesso está restrito sem divulgar qualquer dado", () => {
    expect(explainDenied("exames.read")).toContain("visualizar exames ocupacionais");
  });
});
