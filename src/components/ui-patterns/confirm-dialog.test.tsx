import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmHost, confirmar } from "./confirm-dialog";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("diálogo de confirmação", () => {
  it("mostra o pedido no diálogo do app e devolve true ao confirmar", async () => {
    render(<ConfirmHost />);
    let resposta: Promise<boolean> = Promise.resolve(false);
    act(() => {
      resposta = confirmar({
        titulo: "Excluir 3 itens?",
        descricao: "Sem volta.",
        confirmar: "Excluir",
      });
    });
    expect(await screen.findByText("Excluir 3 itens?")).toBeInTheDocument();
    expect(screen.getByText("Sem volta.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
    await expect(resposta).resolves.toBe(true);
  });

  it("devolve false ao cancelar", async () => {
    render(<ConfirmHost />);
    let resposta: Promise<boolean> = Promise.resolve(true);
    act(() => {
      resposta = confirmar({ titulo: "Apagar?" });
    });
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    await expect(resposta).resolves.toBe(false);
  });

  it("sem o diálogo montado, usa a confirmação do navegador", async () => {
    const nativo = vi.spyOn(window, "confirm").mockReturnValue(true);
    await expect(confirmar({ titulo: "Seguir?" })).resolves.toBe(true);
    expect(nativo).toHaveBeenCalledWith("Seguir?");
  });
});
