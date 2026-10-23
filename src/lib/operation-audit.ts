import { supabase } from "./supabase";

export type AuditResult = "success" | "pending" | "conflict" | "error";
export type AuditModule =
  | "ESTOQUE"
  | "ARMARIOS"
  | "INSPECOES"
  | "EXAMES"
  | "TREINAMENTOS"
  | "CERTIFICADOS"
  | "AUTENTICACAO"
  | "SISTEMA";

export interface OperationAuditEvent {
  id: string;
  createdAt: string;
  module: AuditModule;
  action: string;
  entityType?: string;
  entityId?: string;
  result: AuditResult;
  description: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

const QUEUE_KEY = "volga:audit-pendente:v1";

function id(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readQueue(): OperationAuditEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    const value = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? (value as OperationAuditEvent[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(events: OperationAuditEvent[]): void {
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(events.slice(-200)));
  } catch (error) {
    console.error("Não foi possível guardar a auditoria pendente.", error);
  }
}

export function pendingAuditEvents(): OperationAuditEvent[] {
  return readQueue();
}

function toRpcArgs(event: OperationAuditEvent) {
  return {
    p_action: event.action,
    p_module: event.module,
    p_entity_type: event.entityType ?? null,
    p_entity_id: event.entityId ?? null,
    p_description: event.description,
    p_metadata: {
      ...event.metadata,
      resultado: event.result,
      correlation_id: event.correlationId ?? event.id,
    },
  };
}

/**
 * Registra o evento no servidor. Só entra na fila local (uma única vez) quando o envio
 * falha; ao ser enviado com sucesso, não fica nada pendente para reenvio.
 */
export async function recordOperation(
  event: Omit<OperationAuditEvent, "id" | "createdAt">,
): Promise<OperationAuditEvent> {
  const complete: OperationAuditEvent = { ...event, id: id(), createdAt: new Date().toISOString() };
  if (!supabase) {
    writeQueue([...readQueue(), complete]);
    return complete;
  }
  let failed = false;
  try {
    const { error } = await supabase.rpc("registrar_evento", toRpcArgs(complete));
    if (error) {
      failed = true;
      console.error("Auditoria ficou pendente de sincronização.", error);
    }
  } catch (error) {
    failed = true;
    console.error("Auditoria ficou pendente de sincronização.", error);
  }
  if (failed) writeQueue([...readQueue(), complete]);
  return complete;
}

let flushing: Promise<number> | null = null;

/** Reenvia a fila pendente. Chamadas simultâneas compartilham o mesmo envio (sem duplicar). */
export function flushPendingAudit(): Promise<number> {
  if (flushing) return flushing;
  flushing = doFlush().finally(() => {
    flushing = null;
  });
  return flushing;
}

async function doFlush(): Promise<number> {
  const pending = readQueue();
  if (!pending.length || !supabase) return 0;
  const sentIds = new Set<string>();
  for (const event of pending) {
    try {
      const { error } = await supabase.rpc("registrar_evento", toRpcArgs(event));
      if (!error) sentIds.add(event.id);
    } catch {
      /* continua pendente */
    }
  }
  // Relê a fila: eventos registrados durante o envio não podem ser perdidos.
  if (sentIds.size) writeQueue(readQueue().filter((event) => !sentIds.has(event.id)));
  return sentIds.size;
}
