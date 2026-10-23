import { parseDateBR } from "./date-br";

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
const MES_RE =
  "(?:janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)";
const NUM = String.raw`\d{1,2}\s*/\s*\d{1,2}\s*/\s*\d{4}`;
const TXT = String.raw`\d{1,2}\s+de\s+${MES_RE}\s+de\s+\d{4}`;
const SEP = String.raw`\s*(?:à|a|até|e|-)\s*`;
// Ranges first so "13/10/2025 à 17/10/2025" collapses into the single form date.
const DATE_RE = new RegExp(
  `(${NUM}${SEP}${NUM}|${NUM})|(\\d{1,2}${SEP}${TXT}|\\d{1,2}\\s+de\\s+${MES_RE}${SEP}${TXT}|${TXT}(?:${SEP}${TXT})?)`,
  "gi",
);

function unesc(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Replaces every baked date (even split across runs) with the form date, keeping run formatting. */
export function replaceDatesInSlideXml(xml: string, data: string): string {
  const d = parseDateBR(data);
  if (!d) return xml;
  const dd = String(d.getDate()).padStart(2, "0");
  const numeric = `${dd}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  const mes = MESES[d.getMonth()];
  const textual = (cap: boolean) =>
    `${dd} de ${cap ? mes[0].toUpperCase() + mes.slice(1) : mes} de ${d.getFullYear()}`;

  return xml.replace(/<a:p>[\s\S]*?<\/a:p>/g, (para) => {
    const nodes = [...para.matchAll(/(<a:t>)([\s\S]*?)(<\/a:t>)/g)];
    if (!nodes.length) return para;
    const texts = nodes.map((n) => unesc(n[2]));
    const full = texts.join("");
    const hits = [...full.matchAll(DATE_RE)];
    if (!hits.length) return para;
    // Character-level edit: replacement goes into the run where the match starts.
    const out = texts.map((t) => t.split(""));
    const owner: Array<[number, number]> = [];
    texts.forEach((t, ti) => {
      for (let ci = 0; ci < t.length; ci++) owner.push([ti, ci]);
    });
    for (const h of hits) {
      const start = h.index ?? 0;
      const cap = /[A-ZÀ-Ý]/.test(h[0].match(new RegExp(MES_RE, "i"))?.[0]?.[0] ?? "");
      const repl = h[1] ? numeric : textual(cap);
      for (let k = start; k < start + h[0].length; k++) {
        const [ti, ci] = owner[k];
        out[ti][ci] = k === start ? repl : "";
      }
    }
    let i = 0;
    return para.replace(
      /(<a:t>)([\s\S]*?)(<\/a:t>)/g,
      (_m, a, _b, c) => `${a}${esc(out[i++].join(""))}${c}`,
    );
  });
}
