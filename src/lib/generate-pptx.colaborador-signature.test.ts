import { describe, expect, it, vi, beforeAll } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import PizZip from "pizzip";

const saved: { blob: Blob | null; name: string } = { blob: null, name: "" };

vi.mock("file-saver", () => ({
  default: {
    saveAs: (blob: Blob, name: string) => {
      saved.blob = blob;
      saved.name = name;
    },
  },
}));

beforeAll(() => {
  // Ambiente mínimo de browser para template-fetch (window.setTimeout) e fetch do modelo.
  (globalThis as Record<string, unknown>).window = {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
  globalThis.fetch = (async (url: unknown) => {
    const path = String(url).replace(/^\//, "");
    const buf = readFileSync(resolve(__dirname, "../../public", path));
    return new Response(buf, { status: 200 });
  }) as typeof fetch;
});

describe("assinatura do colaborador em modelos com três assinaturas", () => {
  it("nome do colaborador na linha de assinatura usa o mesmo corpo da linha (NR-12)", async () => {
    const { generatePptx } = await import("./generate-pptx");
    const { DEFAULT_SHARED } = await import("./certificate-template");

    const shared = {
      ...DEFAULT_SHARED,
      treinamento: "NR-12",
      templateUrl: "/templates/originals/Certificado_Volga_-_NR_12.pptx",
    };
    const cols = [{ nome: "Mariana Aparecida Fernandes", cpf: "123.456.789-09", incluir: true }];

    await generatePptx(shared, cols, "teste.pptx");
    expect(saved.blob).toBeTruthy();

    const generated = saved.blob as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> };
    const buffer =
      typeof generated.arrayBuffer === "function"
        ? await generated.arrayBuffer()
        : await new Promise<ArrayBuffer>((resolveBuffer, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolveBuffer(reader.result as ArrayBuffer);
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(generated);
          });
    const bytes = Buffer.from(buffer);
    const zip = new PizZip(bytes);
    const slide = zip.file("ppt/slides/slide1.xml")!.asText();

    // O nome na linha de assinatura (caixa com sublinhados) não pode ficar em corpo menor.
    const sigBox = slide.match(
      /<p:txBody>(?:(?!<\/p:txBody>)[\s\S])*?_{5,}(?:(?!<\/p:txBody>)[\s\S])*?Mariana[\s\S]*?<\/p:txBody>/,
    );
    expect(sigBox, "caixa de assinatura do colaborador com o nome").toBeTruthy();
    const nameRun = sigBox![0].match(
      /<a:rPr[^>]*sz="(\d+)"[^>]*>(?:(?!<a:r[ >])[\s\S])*?<a:t>\s*Mariana/,
    );
    expect(nameRun, "run do nome do colaborador").toBeTruthy();
    // Mesmo corpo da linha, reduzido apenas o necessário para caber na caixa.
    const sz = Number(nameRun![1]);
    expect(sz).toBeLessThanOrEqual(1400);
    expect(sz).toBeGreaterThanOrEqual(1100);
  });

  it.each([
    "Certificado_Volga_-_NR_18_-_Trabalho_a_quente.pptx",
    "Certificado_Volga_-_NR34_-_Trabalho_a_quente.pptx",
  ])("coloca a linha acima do nome em todos os canhotos de %s", async (template) => {
    const { generatePptx } = await import("./generate-pptx");
    const { DEFAULT_SHARED } = await import("./certificate-template");
    const colaboradores = [
      { nome: "Jose Maria da Silva Neto", cpf: "123.456.789-09", incluir: true },
      { nome: "Ana Paula Rodrigues", cpf: "987.654.321-00", incluir: true },
      { nome: "Marcos Antonio Souza", cpf: "111.222.333-44", incluir: true },
    ];

    await generatePptx(
      {
        ...DEFAULT_SHARED,
        treinamento: "Trabalho a quente",
        templateUrl: `/templates/originals/${template}`,
      },
      colaboradores,
      "teste-assinatura.pptx",
    );

    const generated = saved.blob as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> };
    const buffer =
      typeof generated.arrayBuffer === "function"
        ? await generated.arrayBuffer()
        : await new Promise<ArrayBuffer>((resolveBuffer, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolveBuffer(reader.result as ArrayBuffer);
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(generated);
          });
    if (process.env.CERTIFICATE_QA_DIR) {
      writeFileSync(resolve(process.env.CERTIFICATE_QA_DIR, template), Buffer.from(buffer));
    }
    const zip = new PizZip(Buffer.from(buffer));
    colaboradores.forEach((colaborador, index) => {
      const slideNumber = index * 2 + 1;
      const slide = zip.file(`ppt/slides/slide${slideNumber}.xml`)?.asText() ?? "";
      const signature = [...slide.matchAll(/<a:p>[\s\S]*?<\/a:p>/g)]
        .map((match) => match[0])
        .find((paragraph) => paragraph.includes(colaborador.nome));

      expect(signature, `assinatura do colaborador no slide ${slideNumber}`).toBeTruthy();
      expect(signature).toMatch(
        new RegExp(`_{5,}[\\s\\S]*?<a:br\\b[\\s\\S]*?<a:t>\\s*${colaborador.nome}\\s*</a:t>`),
      );
    });
  });

  it("separa CPF do nome no cabeçalho e deixa somente o nome no canhoto", async () => {
    const { generatePptx } = await import("./generate-pptx");
    const { DEFAULT_SHARED } = await import("./certificate-template");

    await generatePptx(
      DEFAULT_SHARED,
      [{ nome: "Ismael Firmino Rodrigues 704.505.891-88", cpf: "", incluir: true }],
      "teste-cpf.pptx",
    );

    const generated = saved.blob as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> };
    const buffer =
      typeof generated.arrayBuffer === "function"
        ? await generated.arrayBuffer()
        : await new Promise<ArrayBuffer>((resolveBuffer, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolveBuffer(reader.result as ArrayBuffer);
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(generated);
          });
    if (process.env.CERTIFICATE_QA_OUTPUT) {
      writeFileSync(process.env.CERTIFICATE_QA_OUTPUT, Buffer.from(buffer));
    }
    const slide = new PizZip(Buffer.from(buffer)).file("ppt/slides/slide1.xml")?.asText() ?? "";
    const bodies = [...slide.matchAll(/<p:txBody>[\s\S]*?<\/p:txBody>/g)].map((m) => m[0]);
    const header = bodies.find((body) => body.includes("ISMAEL FIRMINO RODRIGUES"));
    const stub = bodies.find((body) => body.includes("Ismael Firmino Rodrigues"));

    expect(header).toContain("CPF:  704.505.891-88");
    expect(header).toMatch(
      /ISMAEL FIRMINO RODRIGUES[\s\S]*?<a:br>[\s\S]*?CPF:\s{2}704\.505\.891-88/,
    );
    expect(stub).toBeTruthy();
    expect(stub).not.toContain("704.505.891-88");
  });
});
