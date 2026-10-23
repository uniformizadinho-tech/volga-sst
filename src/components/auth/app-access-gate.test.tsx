import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ papel: null as string | null }));

vi.mock("@/lib/supabase", () => {
  const session = { user: { id: "u1", email: "nova@volga.local" } };
  return {
    isSupabaseConfigured: true,
    supabase: {
      auth: {
        getSession: async () => ({ data: { session }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: async () => ({}),
      },
      rpc: async (fn: string) =>
        fn === "garantir_meu_perfil"
          ? { data: state.papel, error: null }
          : { data: null, error: null },
    },
  };
});
vi.mock("@/lib/shared-kv", () => ({ pullSharedState: async () => true }));
vi.mock("@/lib/history-store", () => ({ reconcileHistoryAfterPull: () => {} }));
vi.mock("@/assets/volga-logo.png.asset.json", () => ({ default: { url: "/logo.png" } }));

import { AuthProvider } from "@/hooks/use-auth";
import { AppAccessGate } from "./app-access-gate";

function renderGate() {
  render(
    <AuthProvider>
      <AppAccessGate>
        <p>Conteúdo dos módulos</p>
      </AppAccessGate>
    </AuthProvider>,
  );
}

describe("portão de acesso", () => {
  beforeEach(() => {
    state.papel = null;
  });
  afterEach(cleanup);

  it("conta sem perfil fica aguardando liberação e não vê os módulos", async () => {
    renderGate();
    expect(await screen.findByText("Aguardando liberação")).toBeInTheDocument();
    expect(screen.getByText("nova@volga.local")).toBeInTheDocument();
    expect(screen.queryByText("Conteúdo dos módulos")).not.toBeInTheDocument();
  });

  it("perfil desconhecido também aguarda liberação", async () => {
    state.papel = "pendente";
    renderGate();
    expect(await screen.findByText("Aguardando liberação")).toBeInTheDocument();
  });

  it("conta com perfil válido entra nos módulos", async () => {
    state.papel = "sesmt";
    renderGate();
    expect(await screen.findByText("Conteúdo dos módulos")).toBeInTheDocument();
  });
});
