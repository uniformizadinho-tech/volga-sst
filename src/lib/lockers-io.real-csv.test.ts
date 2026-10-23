import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseLockersCsvFile } from "./lockers-io";
import { findInconsistencies, planImport } from "./lockers-domain";

function loadFixtureFile(): File {
  const buf = readFileSync(join(__dirname, "../../fixtures/armarios-masculino.csv"));
  return new File([buf], "armarios-masculino.csv", { type: "text/csv" });
}

const FIXTURE = join(__dirname, "../../fixtures/armarios-masculino.csv");

describe.skipIf(!existsSync(FIXTURE))("parseLockersCsvFile (dados reais da Volga)", () => {
  it("lê as 188 linhas do CSV real sem nenhum aviso", async () => {
    const file = loadFixtureFile();
    const { lockers, warnings } = await parseLockersCsvFile(file);
    expect(warnings).toEqual([]);
    expect(lockers).toHaveLength(188);
  });

  it("decodifica acentos corretamente (Windows-1252, não UTF-8)", async () => {
    const file = loadFixtureFile();
    const { lockers } = await parseLockersCsvFile(file);
    const producao = lockers.find((l) => l.ocupante === "MANNOEL DE SOUSA");
    expect(producao?.setor).toBe("PRODUÇÃO");
  });

  it('normaliza o typo "Maculino" para "Masculino"', async () => {
    const file = loadFixtureFile();
    const { lockers } = await parseLockersCsvFile(file);
    const linha = lockers.find((l) => l.ocupante === "HERVINIO TOMAZ DA ROCHA SOBRINHO");
    expect(linha?.vestiario).toBe("Masculino");
  });

  it('trata "VAZIO" e "TESTE GLOBAL" como armário sem ocupante fixo', async () => {
    const file = loadFixtureFile();
    const { lockers } = await parseLockersCsvFile(file);
    const vazio = lockers.find((l) => l.numero === "236");
    const testeGlobal = lockers.find((l) => l.numero === "445");
    expect(vazio?.ocupante).toBe("");
    expect(testeGlobal?.ocupante).toBe("");
  });

  it("separa número e localização mesmo com espaçamento irregular", async () => {
    const file = loadFixtureFile();
    const { lockers } = await parseLockersCsvFile(file);
    const l = lockers.find((l) => l.ocupante === "LIZAELSON SANTOS AIRES");
    expect(l?.numero).toBe("271");
    expect(l?.localizacao).toBe("Corredor Externo");
  });

  it("planeja a importação sem estourar a restrição única (armário 402 repetido)", async () => {
    const { lockers } = await parseLockersCsvFile(loadFixtureFile());
    const plan = planImport(lockers, []);
    expect(plan.novos).toHaveLength(187);
    expect(plan.conflitosArquivo).toHaveLength(1);
    expect(plan.conflitosArquivo[0].mantido.ocupante).toBe("BRUNO LEONARDO LOPES");
    const keys = new Set(plan.novos.map((l) => `${l.vestiario}|${l.localizacao}|${l.numero}`));
    expect(keys.size).toBe(plan.novos.length);
  });

  it("dados importados já saem padronizados (3 locais, sem nada fora do padrão)", async () => {
    const { lockers } = await parseLockersCsvFile(loadFixtureFile());
    const { novos } = planImport(lockers, []);
    expect(new Set(novos.map((l) => l.localizacao)).size).toBe(3);
    expect(findInconsistencies(novos).foraDoPadrao).toHaveLength(0);
  });
});
