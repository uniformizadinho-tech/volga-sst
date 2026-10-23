import { describe, expect, it } from "vitest";
import { isValidCPF, maskCPF } from "./cpf";

describe("maskCPF", () => {
  it("aplica a máscara completa 000.000.000-00", () => {
    expect(maskCPF("11144477735")).toBe("111.444.777-35");
  });

  it("aplica a máscara parcial conforme os dígitos digitados", () => {
    expect(maskCPF("111")).toBe("111");
    expect(maskCPF("111444")).toBe("111.444");
    expect(maskCPF("111444777")).toBe("111.444.777");
  });

  it("ignora caracteres não numéricos e trunca em 11 dígitos", () => {
    expect(maskCPF("111.444.777-35999")).toBe("111.444.777-35");
    expect(maskCPF("abc111444777de35")).toBe("111.444.777-35");
  });

  it("retorna string vazia para entrada vazia", () => {
    expect(maskCPF("")).toBe("");
  });
});

describe("isValidCPF", () => {
  it("aceita CPFs válidos, com ou sem máscara", () => {
    expect(isValidCPF("11144477735")).toBe(true);
    expect(isValidCPF("111.444.777-35")).toBe(true);
    expect(isValidCPF("123.456.789-09")).toBe(true);
  });

  it("rejeita CPFs com dígito verificador incorreto", () => {
    expect(isValidCPF("11144477736")).toBe(false);
    expect(isValidCPF("123.456.789-00")).toBe(false);
  });

  it("rejeita sequências de dígitos repetidos", () => {
    expect(isValidCPF("00000000000")).toBe(false);
    expect(isValidCPF("11111111111")).toBe(false);
  });

  it("rejeita entradas com tamanho diferente de 11 dígitos", () => {
    expect(isValidCPF("123456789")).toBe(false);
    expect(isValidCPF("")).toBe(false);
  });
});
