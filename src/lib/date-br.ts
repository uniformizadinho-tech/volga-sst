// Parser tolerante de datas em português usadas no campo "Data de realização".
// Aceita: "15 de junho de 2026", "15/06/2026", "15-06-2026" e ISO "2026-06-15".

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

function normalize(s: string): string {
  return s
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

const MESES_NORM = MESES.map(normalize);

/** Cria a data e rejeita valores que o JS "rolaria" (ex.: 32/13 ou 31/02). */
function mk(y: number, m: number, d: number): Date | undefined {
  const dt = new Date(y, m, d);
  return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d ? dt : undefined;
}

export function parseDateBR(input: string | null | undefined): Date | undefined {
  const raw = (input ?? "").trim();
  if (!raw) return undefined;

  // ISO: 2026-06-15
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return mk(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }

  // dd/mm/yyyy ou dd-mm-yyyy
  const num = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (num) {
    const year = Number(num[3].length === 2 ? `20${num[3]}` : num[3]);
    return mk(year, Number(num[2]) - 1, Number(num[1]));
  }

  // "15 de junho de 2026" (ou "15 junho 2026")
  const norm = normalize(raw);
  const ext = norm.match(/^(\d{1,2})\s*(?:de\s+)?([a-z]+)\s*(?:de\s+)?(\d{4})$/);
  if (ext) {
    const mes = MESES_NORM.indexOf(ext[2]);
    if (mes >= 0) {
      return mk(Number(ext[3]), mes, Number(ext[1]));
    }
  }

  // Antes havia um fallback `new Date(raw)` aqui para tentar interpretar
  // qualquer outro texto. Isso era perigoso: o parser nativo de Date em JS
  // aceita textos sem sentido de forma inconsistente entre navegadores (ex.:
  // "mes inexistente 2026" virava silenciosamente 01/01/2026 no V8). Como o
  // campo alimenta a data impressa no certificado, um texto não reconhecido
  // deve ser tratado como inválido, nunca "adivinhado".
  return undefined;
}

export function isDateBRValid(input: string): boolean {
  return parseDateBR(input) !== undefined;
}
