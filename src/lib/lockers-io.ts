import Papa from "papaparse";
import { loadXlsx } from "./xlsx-lazy";
import {
  FIELD_LABELS,
  headerKey,
  lockersFromRows,
  lockersToRows,
  type ImportPlan,
  type Locker,
} from "./lockers-domain";
import { newLockerId } from "./lockers-store";

/**
 * O CSV original vem em Windows-1252 (acentuação quebra se lido como UTF-8).
 * Tenta UTF-8; se surgir o caractere de substituição, refaz como Windows-1252.
 */
function decodeText(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const text = utf8.includes("\uFFFD") ? new TextDecoder("windows-1252").decode(bytes) : utf8;
  return text.replace(/^\uFEFF/, "");
}

function isSpreadsheet(file: File): boolean {
  return /\.(xlsx|xlsm|xls|ods)$/i.test(file.name);
}

export const LOCKERS_IMPORT_ACCEPT = ".csv,.xlsx,.xls,.ods";

/**
 * Lê a planilha de controle de armários (CSV em ; ou , — ou Excel) com as
 * colunas Vestiário, NOME1, SETOR, NUMERO DO ARMARIO, SITUAÇÃO (Local é opcional).
 * Nada é gravado aqui: a tela monta a prévia com `planImport` antes.
 */
const NUMERO_KEYS = [
  "numerodoarmario",
  "numero",
  "armario",
  "n",
  "no",
  "numarmario",
  "narmario",
  "nodoarmario",
];

/** Acha a linha de cabeçalho (pode haver título/linhas vazias acima) e monta objetos. */
function rowsFromMatrix(matrix: unknown[][]): Array<Record<string, unknown>> | null {
  const limit = Math.min(matrix.length, 30);
  for (let i = 0; i < limit; i++) {
    const cells = (matrix[i] ?? []).map((c) => String(c ?? "").trim());
    if (!cells.some((c) => NUMERO_KEYS.includes(headerKey(c)))) continue;
    const headers = cells.map((c, idx) => c || `__col${idx}`);
    return matrix.slice(i + 1).map((r) => {
      const o: Record<string, unknown> = {};
      headers.forEach((h, idx) => (o[h] = (r ?? [])[idx] ?? ""));
      return o;
    });
  }
  return null;
}

export async function parseLockersCsvFile(
  file: File,
): Promise<{ lockers: Locker[]; warnings: string[] }> {
  const buf = await file.arrayBuffer();
  let rows: Array<Record<string, unknown>> | null = null;
  let fallback: Array<Record<string, unknown>> = [];

  if (isSpreadsheet(file)) {
    const XLSX = await loadXlsx();
    const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
    if (!wb.SheetNames.length)
      return { lockers: [], warnings: ["A planilha não tem nenhuma aba com dados."] };
    for (const name of wb.SheetNames) {
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
        header: 1,
        defval: "",
        raw: false,
      });
      rows = rowsFromMatrix(matrix);
      if (rows) break;
    }
    if (!rows)
      fallback = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: false });
  } else {
    const text = decodeText(new Uint8Array(buf));
    rows = rowsFromMatrix(Papa.parse<unknown[]>(text, { skipEmptyLines: "greedy" }).data);
    if (!rows)
      fallback = Papa.parse<Record<string, unknown>>(text, {
        header: true,
        skipEmptyLines: "greedy",
      }).data;
  }

  return lockersFromRows(rows ?? fallback, newLockerId);
}

/** CSV em ; com BOM — abre direto no Excel em PT-BR com acentos corretos. */
export function lockersToCsv(list: Locker[]): string {
  return (
    "\uFEFF" +
    Papa.unparse(lockersToRows(list), { delimiter: ";", escapeFormulae: /^[=+\-@\t\r\n]/ })
  );
}

/** Relatório completo da importação (problemas, conflitos, novos e alterações) para revisão no Excel. */
export function importReportCsv(plan: ImportPlan, warnings: string[]): string {
  const rotulo = (l: Locker) => `${l.numero}${l.localizacao ? ` (${l.localizacao})` : ""}`;
  const rows: Array<{ Tipo: string; Armário: string; Detalhe: string }> = [];
  for (const w of warnings) rows.push({ Tipo: "Problema", Armário: "", Detalhe: w });
  for (const c of plan.conflitosArquivo) {
    rows.push({
      Tipo: "Repetido no arquivo",
      Armário: rotulo(c.mantido),
      Detalhe: `${c.motivo} Mantido: ${c.mantido.ocupante || "livre"}. Descartado(s): ${c.descartados
        .map((d) => d.ocupante || "livre")
        .join(", ")}.`,
    });
  }
  for (const d of plan.ocupantesDuplicados) {
    rows.push({
      Tipo: "Colaborador em mais de um armário",
      Armário: d.armarios.join(", "),
      Detalhe: d.nome,
    });
  }
  for (const l of plan.novos) {
    rows.push({
      Tipo: "Novo",
      Armário: rotulo(l),
      Detalhe: [l.ocupante || "livre", l.setor, l.situacao].filter(Boolean).join(" · "),
    });
  }
  for (const a of plan.atualizados) {
    rows.push({
      Tipo: "Atualizado",
      Armário: rotulo(a.depois),
      Detalhe: a.campos
        .map((c) => `${FIELD_LABELS[c]}: ${a.antes[c] || "vazio"} → ${a.depois[c] || "vazio"}`)
        .join(" | "),
    });
  }
  return "\uFEFF" + Papa.unparse(rows, { delimiter: ";", escapeFormulae: /^[=+\-@\t\r\n]/ });
}
