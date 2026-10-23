import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const saved: string[] = [];
const requested: string[] = [];

vi.mock("file-saver", () => ({
  default: {
    saveAs: (_blob: Blob, name: string) => saved.push(name),
  },
}));

beforeAll(() => {
  (globalThis as Record<string, unknown>).window = {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
  globalThis.fetch = (async (url: unknown) => {
    requested.push(String(url));
    const path = String(url).replace(/^\//, "");
    const buf = readFileSync(resolve(__dirname, "../../public", path));
    return new Response(buf, { status: 200 });
  }) as typeof fetch;
});

describe("modelos PDF operacionais locais", () => {
  it("gera a Carta de Anuência sem acessar o endpoint remoto", async () => {
    const { generateAnuenciaPdf } = await import("./generate-anuencia");
    await generateAnuenciaPdf(
      [{ nome: "Maria da Silva", cpf: "123.456.789-09" }],
      { cidade: "Aparecida de Goiânia", data: "2026-10-10", nrs: { nr10: true } },
      "carta-teste.pdf",
    );
    expect(saved).toContain("carta-teste.pdf");
    expect(requested).toContain("/templates/carta-anuencia-modelo.pdf");
    expect(requested).not.toContain(expect.stringContaining("__l5e/assets-v1"));
  });

  it("gera o Termo de Regras de Ouro sem acessar o endpoint remoto", async () => {
    const { generateRegrasDeOuroPdf } = await import("./generate-regras-de-ouro");
    await generateRegrasDeOuroPdf(
      [{ nome: "João de Souza", cpf: "987.654.321-00" }],
      { cidade: "Aparecida de Goiânia", data: "2026-10-10" },
      "regras-teste.pdf",
    );
    expect(saved).toContain("regras-teste.pdf");
    expect(requested).toContain("/templates/regras-de-ouro-modelo.pdf");
    expect(requested).not.toContain(expect.stringContaining("__l5e/assets-v1"));
  });
});
