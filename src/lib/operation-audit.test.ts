import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("./supabase", () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

import { flushPendingAudit, pendingAuditEvents, recordOperation } from "./operation-audit";

const base = { module: "SISTEMA" as const, action: "TEST", description: "teste" };

describe("auditoria de operações", () => {
  beforeEach(() => {
    localStorage.clear();
    rpc.mockReset();
  });

  it("não deixa evento pendente quando o envio dá certo, mesmo com resultado de erro", async () => {
    rpc.mockResolvedValue({ error: null });
    await recordOperation({ ...base, result: "error" });
    expect(pendingAuditEvents()).toHaveLength(0);
  });

  it("guarda o evento uma única vez quando o envio falha", async () => {
    rpc.mockResolvedValue({ error: { message: "offline" } });
    await recordOperation({ ...base, result: "error" });
    expect(pendingAuditEvents()).toHaveLength(1);
  });

  it("guarda o evento quando a chamada lança exceção", async () => {
    rpc.mockRejectedValue(new Error("rede"));
    await recordOperation({ ...base, result: "success" });
    expect(pendingAuditEvents()).toHaveLength(1);
  });

  it("reenvia a fila e remove só o que foi enviado", async () => {
    rpc.mockResolvedValue({ error: { message: "offline" } });
    await recordOperation({ ...base, action: "A", result: "success" });
    await recordOperation({ ...base, action: "B", result: "success" });
    rpc.mockImplementation(async (_fn: string, args: { p_action: string }) =>
      args.p_action === "A" ? { error: null } : { error: { message: "offline" } },
    );
    expect(await flushPendingAudit()).toBe(1);
    expect(pendingAuditEvents().map((e) => e.action)).toEqual(["B"]);
  });

  it("chamadas simultâneas de reenvio não duplicam eventos", async () => {
    rpc.mockResolvedValue({ error: { message: "offline" } });
    await recordOperation({ ...base, result: "success" });
    rpc.mockReset();
    rpc.mockResolvedValue({ error: null });
    await Promise.all([flushPendingAudit(), flushPendingAudit(), flushPendingAudit()]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(pendingAuditEvents()).toHaveLength(0);
  });
});
