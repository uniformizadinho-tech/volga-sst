import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  classifyTraining,
  emptyTrainingState,
  filterTrainingRecords,
  grupoTreinamentoVinculado,
  latestTrainingRecords,
  linkTrainingOrigins,
  mergeTrainingRecords,
  parseTrainingWorkbook,
  requerAcaoTreinamento,
  resumirMatrizTreinamentos,
  trainingPeople,
} from "./training-matrix";

function sample() {
  const w = XLSX.utils.book_new();
  const s = XLSX.utils.aoa_to_sheet([
    [
      "Cód. Empresa",
      "Nome Funcionário",
      "Descr. Departamento",
      "Descr. Função",
      "Status NR01",
      "Obs.",
      "data de emissão",
    ],
    [11, "JOÃO SILVA", "Linha 2", "Montador", "Possui NR-01", "Realizado em 01/04/2026", ""],
    [
      1,
      "JOÃO SILVA",
      "Linha 2",
      "Montador",
      "Não possui NR-01",
      "integração vencida",
      "15/06/2026",
    ],
  ]);
  s["!rows"] = [{}, { hidden: true }];
  XLSX.utils.book_append_sheet(w, s, "NR - 01");
  return parseTrainingWorkbook(w, "treinamentos.xlsx", "user", "2026-10-10T14:45:00Z", XLSX.utils);
}
describe("Matriz de treinamentos", () => {
  it("todos pertencem à Matriz mesmo com código de empresa 11", () => {
    expect(sample().map((r) => r.unit)).toEqual(["Matriz", "Matriz"]);
  });
  it("inclui linhas ocultas", () => {
    expect(sample()).toHaveLength(2);
    expect(sample()[0].hidden).toBe(true);
  });
  it("não une homônimos pelo nome", () => {
    expect(trainingPeople(mergeTrainingRecords(emptyTrainingState(), sample()))).toHaveLength(2);
  });
  it("vincula somente após confirmação explícita", () => {
    const state = mergeTrainingRecords(emptyTrainingState(), sample());
    expect(
      trainingPeople(
        linkTrainingOrigins(
          state,
          state.records.map((r) => r.origin),
          "confirmed",
        ),
      ),
    ).toHaveLength(1);
  });
  it("não exige CPF ou matrícula", () => {
    expect(sample()[0].name).toBe("JOÃO SILVA");
    expect(sample()).toHaveLength(2);
  });
  it("reconhece a mesma linha quando o nome foi corrigido na planilha", () => {
    const original = sample()[0];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ["Cód. Empresa", "Nome Funcionário", "Descr. Departamento", "Descr. Função", "Status NR01"],
        [11, "JOÃO DA SILVA", "Linha 2", "Montador", "Não possui NR-01"],
      ]),
      "NR - 01",
    );
    const corrected = parseTrainingWorkbook(
      workbook,
      "treinamentos.xlsx",
      "user",
      "2026-10-11T14:45:00Z",
      XLSX.utils,
    )[0];
    expect(corrected.name).toBe("JOÃO DA SILVA");
    expect(corrected.origin).toBe(original.origin);
    expect(latestTrainingRecords([corrected, original])).toEqual([corrected]);
  });
  it("preserva vínculos manuais das chaves antigas que incluíam o nome", () => {
    const original = sample()[0];
    const group = "person:confirmada";
    const legacy = {
      ...original,
      id: `legacy:${original.id}`,
      origin: `${original.origin}:joao silva`,
    };
    const corrected = {
      ...original,
      id: `current:${original.id}`,
      name: "JOÃO DA SILVA",
      importedAt: "2026-11-01T00:00:00.000Z",
    };
    const state = { records: [legacy, corrected], links: { [legacy.origin]: group } };
    expect(latestTrainingRecords(state.records)).toEqual([corrected]);
    expect(trainingPeople(state)).toHaveLength(1);
    expect(trainingPeople(state)[0].id).toBe(group);
    expect(grupoTreinamentoVinculado(state, corrected)).toBe(group);
  });
  it("possui não significa comprovado ou em dia", () => {
    expect(classifyTraining("Possui NR-01", "")).toBe("declarado");
  });
  it("declaração sem comprovante continua em aberto", () => {
    expect(requerAcaoTreinamento("declarado")).toBe(true);
  });

  it("filtra registros por NR e situação sem alterar a origem", () => {
    const records = sample();
    expect(filterTrainingRecords(records, "01", "pending")).toHaveLength(2);
    expect(filterTrainingRecords(records, "01", "revisar")).toHaveLength(1);
    expect(filterTrainingRecords(records, "06", "all")).toHaveLength(0);
    expect(records).toHaveLength(2);
  });
  it("certificado não encontrado permanece diferente de não possui", () => {
    expect(classifyTraining("Não possui NR-06", "CERTIFICADO NÃO ENCONTRADO")).toBe("comprovante");
  });
  it("verificar permanece pendente", () => {
    expect(classifyTraining("Possui Nr 18", "Possui NR-18 na pasta CERTIFICADOS (Verificar)")).toBe(
      "revisar",
    );
  });
  it("não inventa vencimentos", () => {
    expect(sample().map((r) => r.expiry)).toEqual([null, null]);
  });
  it("preserva datas e observações contraditórias", () => {
    expect(sample()[1].notes).toBe("integração vencida · 15/06/2026");
    expect(sample()[1].dates).toEqual(["15/06/2026"]);
    expect(sample()[1].status).toBe("revisar");
  });
  it("importação repetida não duplica nem remove histórico", () => {
    const first = mergeTrainingRecords(emptyTrainingState(), sample());
    expect(mergeTrainingRecords(first, sample()).records).toHaveLength(2);
  });
  it("escolhe o estado atual pela data de importação, não pela ordem do histórico", () => {
    const [original] = sample();
    const antigo = {
      ...original,
      id: "antigo",
      status: "declarado" as const,
      importedAt: "2026-01-01T00:00:00.000Z",
    };
    const recente = {
      ...original,
      id: "recente",
      status: "revisar" as const,
      importedAt: "2026-09-01T00:00:00.000Z",
    };
    expect(latestTrainingRecords([recente, antigo])).toEqual([recente]);
  });
  it("resume somente as linhas atuais e conserva estados documentais distintos", () => {
    const [original, outraOrigem] = sample();
    const outraAtual = { ...outraOrigem, status: "nao_possui" as const };
    const atualizado = {
      ...original,
      id: "mais-recente",
      status: "revisar" as const,
      importedAt: "2026-11-01T00:00:00.000Z",
    };
    const summary = resumirMatrizTreinamentos(
      mergeTrainingRecords(emptyTrainingState(), [original, outraAtual, atualizado]),
    );
    expect(summary.registros).toBe(2);
    expect(summary.emAberto).toBe(2);
    expect(summary.porStatus.revisar).toBe(1);
    expect(summary.porStatus.nao_possui).toBe(1);
    expect(summary.porNr.find((item) => item.nr === "01")?.total).toBe(2);
  });
});
