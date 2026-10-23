import Papa from "papaparse";
import { loadXlsx } from "./xlsx-lazy";
import type { Colaborador } from "./certificate-template";
import { maskCPF } from "./cpf";

// Parser flexível para colar lista: aceita separadores ; , tab
// e cabeçalho opcional. Ignora linhas em branco.
export function parseBulkText(text: string): Colaborador[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: Colaborador[] = [];
  for (const line of lines) {
    const parts = line.split(/\t|;|,|\|/).map((p) => p.trim().replace(/^"|"$/g, ""));
    if (parts.length < 1) continue;
    // pular cabeçalho
    if (parts.length >= 2 && /^nome/i.test(parts[0]) && /^cpf/i.test(parts[1])) {
      continue;
    }
    let nome = parts[0] || "";
    let cpfRaw = parts[1] || "";
    // Nome e CPF separados só por espaço (ex.: "Fulano 123.456.789-00")
    const m = nome.match(
      /^(.*?)\s*(?:[-–—]\s*)?(?:CPF\s*:?\s*)?(\d{3}[.\s]?\d{3}[.\s]?\d{3}[-.\s]?\d{2})\s*$/i,
    );
    if (m) {
      nome = m[1].replace(/[\s\-–—:]+$/, "").trim();
      if (!cpfRaw) cpfRaw = m[2];
    }
    if (!nome && !cpfRaw) continue;
    out.push({ nome, cpf: maskCPF(cpfRaw) });
  }
  return out;
}

function pickField(row: Record<string, unknown>, keys: string[]): string {
  for (const k of Object.keys(row)) {
    const norm = k.toLowerCase().trim();
    if (keys.includes(norm)) {
      const v = row[k];
      return v == null ? "" : String(v);
    }
  }
  return "";
}

function rowsToCols(rows: Record<string, unknown>[]): Colaborador[] {
  return rows
    .map((r) => ({
      nome: pickField(r, ["nome", "colaborador", "name", "funcionario"]).trim(),
      cpf: maskCPF(pickField(r, ["cpf", "documento", "doc"])),
    }))
    .filter((c) => c.nome || c.cpf);
}

export async function parseCsvFile(file: File): Promise<Colaborador[]> {
  const text = await file.text();
  const res = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  if (res.data && res.data.length && Object.keys(res.data[0]).length > 1) {
    return rowsToCols(res.data);
  }
  // fallback: sem header
  return parseBulkText(text);
}

export async function parseXlsxFile(file: File): Promise<Colaborador[]> {
  const buf = await file.arrayBuffer();
  const XLSX = await loadXlsx();
  const wb = XLSX.read(buf, { type: "array" });
  const first = wb.SheetNames[0];
  if (!first) return [];
  const ws = wb.Sheets[first];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: "",
  });
  if (rows.length && Object.keys(rows[0]).some((k) => /nome|cpf/i.test(k))) {
    return rowsToCols(rows);
  }
  // fallback: sem cabeçalho — pega as duas primeiras colunas
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  const out: Colaborador[] = [];
  for (const row of aoa) {
    const nome = String(row[0] ?? "").trim();
    const cpf = maskCPF(String(row[1] ?? ""));
    if (!nome && !cpf) continue;
    if (/^nome$/i.test(nome) && /^cpf$/i.test(String(row[1] ?? ""))) continue;
    out.push({ nome, cpf });
  }
  return out;
}
