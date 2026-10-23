import { describe, expect, it, beforeEach } from "vitest";
import { loadTemplates, saveTemplates, newId } from "./templates-store";

describe("templates-store", () => {
  beforeEach(() => localStorage.clear());
  it("carrega vazio", () => {
    expect(Array.isArray(loadTemplates())).toBe(true);
  });
});
