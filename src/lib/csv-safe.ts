const FORMULA_PREFIX = /^[=+\-@\t\r\n]/;

/** Quotes a CSV field and neutralizes values spreadsheets could execute as formulas. */
export function csvCell(value: unknown): string {
  const text = String(value ?? "");
  const safe = FORMULA_PREFIX.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function csvRow(values: readonly unknown[], delimiter = ";"): string {
  return values.map(csvCell).join(delimiter);
}
