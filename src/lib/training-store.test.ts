import { describe, expect, it } from "vitest";
import { parseTrainingState } from "./training-store";

describe("estado persistido da Matriz", () => {
  it("aceita o envelope mínimo válido", () => {
    expect(parseTrainingState(JSON.stringify({ records: [], links: {} }))).toEqual({
      records: [],
      links: {},
    });
  });

  it("explica quando o JSON compartilhado está corrompido", () => {
    expect(() => parseTrainingState("não é JSON")).toThrow(
      "A Matriz compartilhada está corrompida",
    );
  });

  it("rejeita envelopes sem registros ou vínculos", () => {
    expect(() => parseTrainingState(JSON.stringify({ records: [] }))).toThrow(
      "Os registros de treinamentos precisam de revisão",
    );
    expect(() => parseTrainingState(JSON.stringify({ records: [null], links: {} }))).toThrow(
      "Os registros de treinamentos precisam de revisão",
    );
    expect(() => parseTrainingState(JSON.stringify({ records: [], links: [] }))).toThrow(
      "Os registros de treinamentos precisam de revisão",
    );
  });
});
