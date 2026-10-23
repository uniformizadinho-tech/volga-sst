import { createElement, type ComponentType, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "@/routes/inspecoes";
import { loadDB } from "./inspecoes";

vi.mock("@/components/layout/app-frame", () => ({
  AppFrame: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
const auth = vi.hoisted(() => ({ role: "sesmt" as string }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ role: auth.role }) }));
vi.mock("@/lib/shared-kv", () => ({
  pushShared: vi.fn(),
  saveSharedSnapshot: vi.fn(async (key: string, value: string) => localStorage.setItem(key, value)),
}));

function abrir() {
  const Component = Route.options.component as ComponentType;
  render(createElement(Component));
}

beforeEach(() => {
  localStorage.clear();
  auth.role = "sesmt";
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("fluxo das inspeções", () => {
  it("perfil sem permissão não consegue cadastrar nem importar", () => {
    auth.role = "leitor";
    abrir();
    expect(screen.getByRole("button", { name: "Adicionar equipamento" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Importar planilha inteira" }));
    expect(screen.getByRole("button", { name: "Confirmar importação" })).toBeDisabled();
    expect(loadDB().equipamentos).toHaveLength(0);
  });
  it("salva identificação e checklist juntos sem fabricar inspeção datada", async () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Adicionar equipamento" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Código *"), { target: { value: "EX-200" } });
    fireEvent.change(within(dialog).getByLabelText("Equipamento / item *"), {
      target: { value: "Extintor ABC" },
    });
    fireEvent.change(within(dialog).getByLabelText("Andar / setor *"), {
      target: { value: "Produção" },
    });
    fireEvent.change(within(dialog).getByLabelText("Localização *"), {
      target: { value: "Porta 2" },
    });
    within(dialog)
      .getAllByRole("button", { name: /^Conforme:/ })
      .forEach((b) => fireEvent.click(b));
    fireEvent.click(within(dialog).getByRole("button", { name: "Adicionar equipamento" }));
    await waitFor(() => expect(loadDB().equipamentos).toHaveLength(1));
    expect(loadDB().equipamentos[0]?.checklistCadastro?.["Lacre intacto"]).toBe("ok");
    expect(loadDB().inspecoes).toHaveLength(0);
  });
  it("confirma a planilha inteira sem criar inspeções e reimporta sem duplicar", async () => {
    abrir();
    expect(loadDB().equipamentos).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Importar planilha inteira" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar importação" }));
    await waitFor(() => expect(loadDB().equipamentos).toHaveLength(47));
    expect(loadDB().inspecoes).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Planilha Matriz" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar importação" }));
    await waitFor(() => expect(loadDB().equipamentos).toHaveLength(47));
    expect(loadDB().equipamentos.some((e) => e.tipo === "hidrante")).toBe(true);
    expect(loadDB().equipamentos.some((e) => e.tipo === "iluminacao")).toBe(true);
    expect(loadDB().equipamentos.flatMap((e) => e.pendencias ?? [])).toHaveLength(38);
  }, 15000);
  it("não fecha nem avança quando o armazenamento falha", () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Adicionar equipamento" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Adicionar equipamento" })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Código *"), { target: { value: "EX-100" } });
    fireEvent.change(within(dialog).getByLabelText("Equipamento / item *"), {
      target: { value: "Extintor ABC" },
    });
    fireEvent.change(within(dialog).getByLabelText("Andar / setor *"), {
      target: { value: "Produção" },
    });
    fireEvent.change(within(dialog).getByLabelText("Localização *"), {
      target: { value: "Porta 3" },
    });
    within(dialog)
      .getAllByRole("button", { name: /^Conforme:/ })
      .forEach((b) => fireEvent.click(b));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Quota");
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Adicionar equipamento" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(loadDB().inspecoes).toHaveLength(0);
    expect(loadDB().equipamentos).toHaveLength(0);
  });
});
