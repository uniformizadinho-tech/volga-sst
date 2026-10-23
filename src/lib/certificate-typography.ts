/** Shared export typography, independent of the source template's font theme. */
export const CERTIFICATE_TYPOGRAPHY = {
  font: "Arial",
  title: 5600,
  heading: 1800,
  recipient: 2800,
  cpf: 2200,
  course: 2000,
  body: 1600,
  content: 1400,
  signature: 1200,
  signatureLabel: 1100,
} as const;

function textOf(xml: string): string {
  return [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
    .map((match) => match[1])
    .join("")
    .replace(/&amp;/g, "&")
    .trim();
}

function setAttrs(attrs: string, values: Record<string, string | number>): string {
  let out = attrs;
  for (const [key, value] of Object.entries(values)) {
    out = out.replace(new RegExp(`\\s+${key}="[^"]*"`, "g"), "");
    out += ` ${key}="${value}"`;
  }
  return out;
}

function runStyle(xml: string, size: number, bold?: boolean): string {
  const values: Record<string, string | number> = { sz: size, spc: 0, kern: 0 };
  if (bold !== undefined) values.b = bold ? 1 : 0;
  let out = xml.replace(
    /<a:(rPr|defRPr|endParaRPr)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/a:\1>)/g,
    (_match, tag: string, attrs: string, children: string | undefined) => {
      const body = (children ?? "").replace(/<a:(latin|ea|cs)\b[^>]*\/>/g, "");
      return `<a:${tag}${setAttrs(attrs, values)}>${body}<a:latin typeface="${CERTIFICATE_TYPOGRAPHY.font}"/><a:ea typeface="${CERTIFICATE_TYPOGRAPHY.font}"/><a:cs typeface="${CERTIFICATE_TYPOGRAPHY.font}"/></a:${tag}>`;
    },
  );
  out = out.replace(/<a:r>\s*<a:t>/g, () => `<a:r>${runStyle("<a:rPr/>", size, bold)}<a:t>`);
  return out;
}

/** Estimate wrapped line count conservatively; never enlarge source geometry. */
function fittedSize(
  paragraphs: string[],
  preferred: number,
  width: number,
  height: number,
  spacing: number,
): number {
  if (width <= 0 || height <= 0) return preferred;
  for (let size = preferred; size >= 900; size -= 50) {
    const points = size / 100;
    const charsPerLine = Math.max(1, width / (points * 12700 * 0.56));
    const lines = paragraphs.reduce(
      (sum, text) => sum + Math.max(1, Math.ceil(text.length / charsPerLine)),
      0,
    );
    if (lines * points * 12700 * spacing <= height) return size;
  }
  return 900;
}

export function normalizeCertificateTypography(xml: string): string {
  const front = /CERTIFICAMOS|PARTICIPOU|CONCLUIU|CPF/i.test(textOf(xml));
  const normalized = xml.replace(/<p:sp>[\s\S]*?<\/p:sp>/g, (shape) => {
    const body = shape.match(/<p:txBody>[\s\S]*?<\/p:txBody>/)?.[0];
    if (!body || !textOf(body)) return shape;
    const text = textOf(body);
    const y = Number(shape.match(/<a:off\b[^>]*\by="(\d+)"/)?.[1] ?? 0);
    const width = Number(shape.match(/<a:ext\b[^>]*\bcx="(\d+)"/)?.[1] ?? 0) - 182880;
    const height = Number(shape.match(/<a:ext\b[^>]*\bcy="(\d+)"/)?.[1] ?? 0);
    const label = /^(?:\s*Colaborador\s*$|\s*(?:Instrutor|Respons[áa]vel T[ée]cnico))/i.test(text);
    const signature = front && y > 6000000 && !label && !/VOLGA|CNPJ|CONTE[ÚU]DO/i.test(text);
    const heading =
      /^(?:CERTIFICADO|CERTIFICAMOS QUE O COLABORADOR|CONTE[ÚU]DO PROGRAM[ÁA]TICO)\s*$/i.test(text);
    const recipient = front && /CPF/i.test(text) && !/CNPJ|EMPRESA|PARTICIPOU/i.test(text);
    const course = front && /^(?:Concluiu com profici[êe]ncia)/i.test(text);
    const spacing = label || signature || recipient || heading ? 1 : 1.1;
    const paragraphs = [...body.matchAll(/<a:p>[\s\S]*?<\/a:p>/g)].map((m) => textOf(m[0]));
    const base = label
      ? CERTIFICATE_TYPOGRAPHY.signatureLabel
      : signature
        ? CERTIFICATE_TYPOGRAPHY.signature
        : course
          ? CERTIFICATE_TYPOGRAPHY.course
          : front
            ? CERTIFICATE_TYPOGRAPHY.body
            : CERTIFICATE_TYPOGRAPHY.content;
    const size =
      label || signature || heading || recipient
        ? base
        : fittedSize(paragraphs, base, width, height - 91440, spacing);
    let patched = body.replace(/<a:p>[\s\S]*?<\/a:p>/g, (paragraph) => {
      const paragraphText = textOf(paragraph);
      const paragraphSize = /^CERTIFICADO$/i.test(text)
        ? CERTIFICATE_TYPOGRAPHY.title
        : heading
          ? CERTIFICATE_TYPOGRAPHY.heading
          : recipient
            ? /CPF/i.test(paragraphText)
              ? CERTIFICATE_TYPOGRAPHY.cpf
              : CERTIFICATE_TYPOGRAPHY.recipient
            : size;
      let out = runStyle(paragraph, paragraphSize, signature ? true : label ? false : undefined);
      const spacingXml = `<a:lnSpc><a:spcPct val="${Math.round(spacing * 100000)}"/></a:lnSpc><a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft>`;
      const align: Record<string, string | number> =
        label || signature || heading || recipient ? { algn: "ctr", marL: 0, indent: 0 } : {};
      if (/<a:pPr\b/.test(out)) {
        out = out.replace(
          /<a:pPr\b([^>]*?)(?:\/>|>([\s\S]*?)<\/a:pPr>)/,
          (_m, attrs: string, children: string | undefined) => {
            const rest = (children ?? "").replace(/<a:(lnSpc|spcBef|spcAft)>[\s\S]*?<\/a:\1>/g, "");
            return `<a:pPr${setAttrs(attrs, align)}>${spacingXml}${rest}</a:pPr>`;
          },
        );
      } else out = out.replace("<a:p>", `<a:p><a:pPr${setAttrs("", align)}>${spacingXml}</a:pPr>`);
      return out;
    });
    // Fixed boxes: long names shrink instead of displacing their neighbours.
    patched = patched.replace(
      /<a:bodyPr\b([^>]*?)(?:\/>|>([\s\S]*?)<\/a:bodyPr>)/,
      (_m, attrs: string, children: string | undefined) => {
        const rest = (children ?? "").replace(
          /<a:(spAutoFit|noAutofit|normAutofit)\b[^>]*(?:\/>|>[\s\S]*?<\/a:\1>)/g,
          "",
        );
        return `<a:bodyPr${setAttrs(attrs, { wrap: label || signature || recipient || heading ? "none" : "square" })}>${rest}<a:normAutofit fontScale="100000" lnSpcReduction="0"/></a:bodyPr>`;
      },
    );
    return shape.replace(body, patched);
  });
  // Templates antigos também mantêm tracking negativo em caixas vazias e
  // linhas decorativas. O atributo altera a renderização do slide mesmo sem
  // texto e impede uma tipografia determinística entre modelos.
  return normalized.replace(/(<a:(?:rPr|defRPr|endParaRPr)\b[^>]*?)\s+spc="[^"]*"/g, '$1 spc="0"');
}
