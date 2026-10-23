export const BACKUP_TYPE = "volga-sst-backup" as const;
export const BACKUP_VERSION = 1 as const;

export interface BackupEnvelope {
  tipo: typeof BACKUP_TYPE;
  versao: typeof BACKUP_VERSION;
  criadoEm: string;
  origem: "dispositivo" | "equipe";
  checksum: string;
  dados: Record<string, unknown>;
}

export interface BackupPlan {
  novos: number;
  atualizados: number;
  conflitos: number;
  ignorados: number;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function checksum(value: unknown): string {
  let hash = 2166136261;
  for (const char of stable(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createBackup(
  dados: Record<string, unknown>,
  origem: BackupEnvelope["origem"] = "dispositivo",
): BackupEnvelope {
  const payload = { tipo: BACKUP_TYPE, versao: BACKUP_VERSION, dados };
  return {
    ...payload,
    criadoEm: new Date().toISOString(),
    origem,
    checksum: checksum(payload),
  };
}

export function parseBackup(input: unknown): BackupEnvelope {
  if (!input || typeof input !== "object") throw new Error("O backup não contém um objeto válido.");
  const value = input as Partial<BackupEnvelope>;
  if (
    value.tipo !== BACKUP_TYPE ||
    value.versao !== BACKUP_VERSION ||
    !value.dados ||
    typeof value.dados !== "object"
  ) {
    throw new Error("Backup incompatível com esta versão do Volga SST.");
  }
  const payload = { tipo: value.tipo, versao: value.versao, dados: value.dados };
  if (value.checksum !== checksum(payload))
    throw new Error("O backup foi alterado ou está corrompido.");
  if (!value.criadoEm || Number.isNaN(Date.parse(value.criadoEm)))
    throw new Error("A data do backup é inválida.");
  return value as BackupEnvelope;
}

export function planArrayMerge<T extends Record<string, unknown>>(
  current: T[],
  incoming: T[],
  key: keyof T,
): BackupPlan {
  const currentByKey = new Map(current.map((item) => [String(item[key]), item]));
  let novos = 0,
    atualizados = 0,
    conflitos = 0;
  for (const item of incoming) {
    const id = String(item[key]);
    const old = currentByKey.get(id);
    if (!old) novos += 1;
    else if (stable(old) === stable(item)) continue;
    else atualizados += 1;
    if (old && stable(old) !== stable(item)) conflitos += 1;
  }
  return { novos, atualizados, conflitos, ignorados: 0 };
}
