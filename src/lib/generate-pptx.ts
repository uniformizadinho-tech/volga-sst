import PizZip from "pizzip";
import FileSaver from "file-saver";
const { saveAs } = FileSaver;
import {
  buildBody,
  DEFAULT_CONTEUDO_PROGRAMATICO,
  formatSignatureName,
  ORIGINAL_BODY,
  ORIGINAL_INSTRUTOR,
  ORIGINAL_INSTRUTOR_CARGO,
  SLOTS,
  TEMPLATE_URL,
  replaceAll,
  xmlEscape,
  type Colaborador,
  type SharedFields,
} from "./certificate-template";
import {
  getOriginalInstructorByTemplateUrl,
  normalizeOriginalTemplateUrl,
} from "./builtin-templates";
import { fetchTemplateBuffer } from "./template-fetch";
import { normalizeCollaboratorIdentity } from "./collaborator-preparation";
import { replaceDatesInSlideXml } from "./pptx-dates";
import { normalizeCertificateTypography } from "./certificate-typography";

export const MAX_COLABORADORES = 300;
export const CHUNK_SIZE = SLOTS.length;
const ORIG_SLIDE_COUNT = 10;

/**
 * Classifica um item de conteúdo programático a partir de prefixos textuais:
 *  - "§ ..."   → cabeçalho de seção (negrito, sem bullet, sem indentação)
 *  - "a) ..."  → item com letra (negrito, sem bullet, sem indentação)
 *  - "• ..."   → sub-item indentado (negrito, sem bullet, com indentação)
 *  - qualquer outra coisa → bullet automático herdado do template (compat.)
 */
type ItemKind = "section" | "letter" | "sub" | "bullet";
function classifyItem(raw: string): { kind: ItemKind; text: string; bold: boolean } {
  const t = raw.trim();
  if (/^§\s+/.test(t)) return { kind: "section", text: t.replace(/^§\s+/, ""), bold: true };
  if (/^[A-Za-z]\)\s/.test(t)) return { kind: "letter", text: t, bold: true };
  if (/^[•▪]/.test(t) || /^-\s/.test(t)) return { kind: "sub", text: t, bold: true };
  return { kind: "bullet", text: t, bold: false };
}

function buildPpr(kind: ItemKind, lnPct: number): string | null {
  if (kind === "bullet") return null; // preserva pPr original do template
  const common = `<a:lnSpc><a:spcPct val="${lnPct}"/></a:lnSpc><a:buNone/>`;
  if (kind === "section") {
    return `<a:pPr marL="0" indent="0" algn="l" defTabSz="914400"><a:spcBef><a:spcPts val="600"/></a:spcBef>${common}</a:pPr>`;
  }
  if (kind === "letter") {
    return `<a:pPr marL="0" indent="0" algn="just" defTabSz="914400">${common}</a:pPr>`;
  }
  // sub
  return `<a:pPr marL="228600" indent="0" algn="just" defTabSz="914400">${common}</a:pPr>`;
}

/**
 * Reescreve o bloco do "Conteúdo Programático" no verso do certificado.
 * Usa o primeiro `<a:p>` original como molde e adapta pPr/rPr por item.
 */
function applyConteudoProgramatico(xml: string, topics: string[]): string {
  const first = DEFAULT_CONTEUDO_PROGRAMATICO[0];
  const last = DEFAULT_CONTEUDO_PROGRAMATICO[DEFAULT_CONTEUDO_PROGRAMATICO.length - 1];
  const iFirst = xml.indexOf(`<a:t>${first}</a:t>`);
  const iLast = xml.indexOf(`<a:t>${last}</a:t>`);
  if (iFirst < 0 || iLast < 0) return xml;
  const pStart = xml.lastIndexOf("<a:p>", iFirst);
  const pEndTag = "</a:p>";
  const pEnd = xml.indexOf(pEndTag, iLast) + pEndTag.length;
  if (pStart < 0 || pEnd <= 0) return xml;
  const firstParaEnd = xml.indexOf(pEndTag, iFirst) + pEndTag.length;
  const template = xml.slice(pStart, firstParaEnd);
  const items = topics.map((t) => t.trim()).filter(Boolean).length
    ? topics.map((t) => t.trim()).filter(Boolean)
    : DEFAULT_CONTEUDO_PROGRAMATICO;

  const sz = 1600;
  const lnPct = 115000;

  const rendered = items
    .map((raw) => {
      const { kind, text, bold } = classifyItem(raw);
      let p = template.replace(`<a:t>${first}</a:t>`, `<a:t>${xmlEscape(text)}</a:t>`);
      // Ajusta rPr/endParaRPr: força tamanho fixo e negrito conforme o tipo.
      p = p.replace(/<a:(rPr|endParaRPr)\b([^>]*?)(\/?)>/g, (_m, tag, attrs, slash) => {
        let a = String(attrs)
          .replace(/\s+sz="\d+"/, "")
          .replace(/\s+b="[01]"/, "");
        a = a + ` b="${bold ? 1 : 0}" sz="${sz}"`;
        return `<a:${tag}${a}${slash}>`;
      });
      // Line spacing default (para bullets herdados do template).
      p = p.replace(/<a:spcPct val="\d+"\/>/g, `<a:spcPct val="${lnPct}"/>`);
      // Substitui pPr para tipos hierárquicos.
      const newPpr = buildPpr(kind, lnPct);
      if (newPpr) {
        p = p.replace(/<a:pPr\b[^>]*(?:\/>|>[\s\S]*?<\/a:pPr>)/, newPpr);
      }
      return p;
    })
    .join("");

  // Substitui o bloco de tópicos
  let out = xml.slice(0, pStart) + rendered + xml.slice(pEnd);

  // Impede que a caixa cresça além do slide: troca spAutoFit por normAutofit
  // no txBody que contém os bullets (o mais próximo antes do pStart).
  const bodyStart = out.lastIndexOf("<p:txBody>", pStart);
  const bodyEnd = out.indexOf("</p:txBody>", pStart);
  if (bodyStart >= 0 && bodyEnd > bodyStart) {
    const before = out.slice(0, bodyStart);
    const body = out.slice(bodyStart, bodyEnd);
    const after = out.slice(bodyEnd);
    const patched = body.replace(
      /<a:spAutoFit\s*\/>/,
      `<a:normAutofit fontScale="100000" lnSpcReduction="0"/>`,
    );
    out = before + patched + after;
  }

  return out;
}

function titleCase(s: string): string {
  return formatSignatureName(s);
}

function instructorDisplayName(shared: SharedFields): string {
  return shared.instrutorNome.trim();
}

function templateUrlFor(shared: SharedFields): string {
  return normalizeOriginalTemplateUrl(shared.templateUrl || TEMPLATE_URL);
}

function isOriginalTemplate(shared: SharedFields): boolean {
  return Boolean(shared.templateUrl && shared.templateUrl !== TEMPLATE_URL);
}

function slideNumbers(zip: PizZip): number[] {
  return Object.keys(zip.files)
    .map((name) => name.match(/^ppt\/slides\/slide(\d+)\.xml$/)?.[1])
    .filter((n): n is string => Boolean(n))
    .map((n) => Number(n))
    .sort((a, b) => a - b);
}

/** All download modes share the same final typography pass. */
function standardizeCertificateSlides(zip: PizZip): void {
  for (const n of slideNumbers(zip)) {
    const path = `ppt/slides/slide${n}.xml`;
    const file = zip.file(path);
    if (!file) continue;
    zip.file(
      path,
      fitNoWrapBodies(normalizeCertificateTypography(normalizeSignatureLineBreaks(file.asText()))),
    );
  }
}

function removeSlidesNotIn(zip: PizZip, keep: Set<number>): void {
  const presRelsFile = zip.file("ppt/_rels/presentation.xml.rels");
  const presFile = zip.file("ppt/presentation.xml");
  const ctFile = zip.file("[Content_Types].xml");
  if (!presRelsFile || !presFile || !ctFile) return;

  let presRelsText = presRelsFile.asText();
  let presText = presFile.asText();
  let ctText = ctFile.asText();

  for (const n of slideNumbers(zip)) {
    if (keep.has(n)) continue;

    const relRe = new RegExp(
      `<Relationship Id="(rId\\d+)"[^>]*Target="slides/slide${n}\\.xml"[^>]*/>`,
    );
    const relMatch = presRelsText.match(relRe);
    if (relMatch) {
      const rId = relMatch[1];
      presRelsText = presRelsText.replace(relMatch[0], "");
      const sldRe = new RegExp(`<p:sldId[^>]*r:id="${rId}"/>`);
      presText = presText.replace(sldRe, "");
    }

    const ctRe = new RegExp(`<Override PartName="/ppt/slides/slide${n}\\.xml"[^>]*/>`);
    ctText = ctText.replace(ctRe, "");
    zip.remove(`ppt/slides/slide${n}.xml`);
    zip.remove(`ppt/slides/_rels/slide${n}.xml.rels`);
  }

  zip.file("ppt/_rels/presentation.xml.rels", presRelsText);
  zip.file("ppt/presentation.xml", presText);
  zip.file("[Content_Types].xml", ctText);
}

function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toUpperCase();
}

function xmlUnescape(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * ---------------------------------------------------------------------------
 * HEURÍSTICAS DE DETECÇÃO DE TEXTO (modelos "originais")
 * ---------------------------------------------------------------------------
 * As funções `isLikely*` abaixo tentam adivinhar, por forma do texto (tamanho,
 * caixa, presença de números, palavras-chave a excluir), ONDE em um .pptx
 * arbitrário — enviado pelo usuário, sem estrutura conhecida — está o nome do
 * colaborador, o título do curso, a carga horária etc. Isso é
 * fundamentalmente frágil: qualquer modelo real com um layout fora do comum
 * pode enganar a heurística.
 *
 * Ao alterar algo aqui:
 * 1. NUNCA mude os limites/regex "no escuro" — teste manualmente gerando o
 *    .pptx contra os arquivos reais em `public/templates/originals/`.
 * 2. Prefira restringir (adicionar exclusão) a afrouxar (remover limite) —
 *    um falso negativo só deixa um campo em branco; um falso positivo
 *    sobrescreve texto que não devia, no certificado final de alguém.
 * 3. Se o modelo problemático puder ser convertido para o formato "padrão"
 *    do app, isso é sempre mais robusto do que ajustar a heurística.
 * ---------------------------------------------------------------------------
 */
function isLikelyUpperPersonName(text: string): boolean {
  const t = text.trim();
  if (!t || t.length < 8 || t.length > 64) return false;
  if (!/[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(t) || /\d/.test(t)) return false;
  if (t !== t.toUpperCase()) return false;
  if (t.split(/\s+/).filter(Boolean).length < 2) return false;
  return !/(CERTIFIC|CONTE[ÚU]DO|PROGRAM[ÁA]TICO|VOLGA|ENGENHARIA|SEGURAN[ÇC]A|TRABALHO|TRANSPORTE|MOVIMENTA|ARMAZENAGEM|MANUSEIO|MATERIAIS|PLATAFORMA|NR\s*-?\s*\d+)/i.test(
    t,
  );
}

function isLikelyPersonName(text: string): boolean {
  const t = text.trim();
  if (!t || t.length < 6 || t.length > 90 || /\d/.test(t)) return false;
  if (t.split(/\s+/).filter(Boolean).length < 2) return false;
  return !/(CERTIFIC|CONTE[ÚU]DO|PROGRAM[ÁA]TICO|VOLGA|ENGENHARIA|SEGURAN[ÇC]A|TRABALHO|INSTRUTOR|RESPONS[ÁA]VEL|T[ÉE]C|ENG\.?|CPF|REG:|NR\s*-?\s*\d+)/i.test(
    t,
  );
}

function isLikelyCargoLine(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 90) return false;
  if (/INSTRUTOR|RESPONS[ÁA]VEL|REG:|CREA:|CPF/i.test(t)) return false;
  return /(T[ÉE]C\.?|T[ÉE]CNIC[OA]|ENG\.?|ENGENHEIR[OA]|MEC[ÂA]NIC[OA]|ELETRICISTA|SEGURAN[ÇC]A|TRABALHO)/i.test(
    t,
  );
}

function textNodes(xml: string): string[] {
  return [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => xmlUnescape(m[1]));
}

/** Atualiza uma caixa de nome do aluno sem eliminar a linha de assinatura.
 * Ajusta o texto à largura existente, sem expandir a forma sobre outras áreas. */
function rewriteBareNameBody(body: string, replacement: string): string {
  const original = textNodes(body).join("");
  const prefix = original.match(/^[\s_]+/)?.[0] ?? "";
  const suffix = original.match(/\s*$/)?.[0] ?? "";
  let first = true;
  let out = body.replace(/<a:t>([\s\S]*?)<\/a:t>/g, () => {
    if (!first) return "<a:t></a:t>";
    first = false;
    return `<a:t>${xmlEscape(`${prefix}${replacement}${suffix}`)}</a:t>`;
  });
  out = preventWrap(out);
  return out.replace(/<a:spAutoFit\s*\/>/, "<a:normAutofit/>");
}

function replaceWholeTextBodyName(body: string, originalName: string, replacement: string): string {
  const nodes = [...body.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)];
  if (nodes.length === 0) return body;

  const allText = nodes.map((m) => xmlUnescape(m[1])).join("");
  if (normalizeText(allText) !== normalizeText(originalName)) return body;

  let usedFirst = false;
  return body.replace(/<a:t>([\s\S]*?)<\/a:t>/g, (_m, raw) => {
    const text = xmlUnescape(String(raw));
    if (!usedFirst) {
      usedFirst = true;
      const lead = text.match(/^\s*/)?.[0] ?? "";
      const tail = allText.match(/\s*$/)?.[0] ?? "";
      return `<a:t>${xmlEscape(`${lead}${replacement}${tail}`)}</a:t>`;
    }
    return "<a:t></a:t>";
  });
}

function replaceNormalizedText(xml: string, original: string, replacement: string): string {
  if (!original.trim() || !replacement.trim()) return xml;
  return xml.replace(/<a:t>([\s\S]*?)<\/a:t>/g, (m, raw) => {
    const text = xmlUnescape(String(raw));
    if (normalizeText(text) !== normalizeText(original)) return m;
    const lead = text.match(/^\s*/)?.[0] ?? "";
    const tail = text.match(/\s*$/)?.[0] ?? "";
    return `<a:t>${xmlEscape(`${lead}${replacement}${tail}`)}</a:t>`;
  });
}

/**
 * Garante que uma caixa de texto não quebre o nome em duas linhas quando o
 * substituto é mais longo que o nome original do template. Sem isso, um
 * nome longo empurra a caixa (spAutoFit) para baixo e sobrepõe o texto do
 * cargo/registro que vem imediatamente abaixo, na posição fixa original.
 */
export function preventWrap(bodyXml: string): string {
  let out = bodyXml.replace(
    /<a:bodyPr([^>]*?)(\/)?>/,
    (m, attrs: string, selfClose: string | undefined) => {
      if (/\bwrap\s*=/.test(attrs)) {
        const patched = attrs.replace(/wrap\s*=\s*"[^"]*"/, 'wrap="none"');
        return `<a:bodyPr${patched}${selfClose ? " /" : ""}>`;
      }
      return `<a:bodyPr${attrs} wrap="none"${selfClose ? " /" : ""}>`;
    },
  );
  // spAutoFit aumenta a forma para acomodar o texto e invade os campos
  // vizinhos. normAutofit mantém a geometria do modelo e reduz a fonte só
  // quando necessário, preservando nome, cargo e registro em suas áreas.
  out = out.replace(/<a:spAutoFit\s*\/>/, '<a:normAutofit fontScale="100000" lnSpcReduction="0"/>');
  return out;
}

/** Mantém nomes de assinatura dentro das caixas originais do modelo.
 * Abrange também o template padrão, que antes fazia apenas replace textual e
 * por isso não recebia a mesma proteção aplicada aos modelos importados. */
export function stabilizeSignatureNameBodies(xml: string, names: string[]): string {
  const targets = new Set(names.map((name) => normalizeText(name)).filter(Boolean));
  if (!targets.size) return xml;
  return xml.replace(/<p:txBody>[\s\S]*?<\/p:txBody>/g, (body) => {
    const nodes = textNodes(body)
      .map((text) => text.trim())
      .filter(Boolean);
    const hasTarget = nodes.some((text) => targets.has(normalizeText(text.replace(/^_+\s*/, ""))));
    return hasTarget ? preventWrap(body) : body;
  });
}

/**
 * Corrige caixas de assinatura que foram salvas no modelo com a linha e o
 * nome no mesmo parágrafo. O padrão dos certificados é linha acima e nome
 * centralizado abaixo. A regra é deliberadamente estreita para não alterar
 * linhas decorativas nem caixas que já possuem a quebra correta.
 */
export function normalizeSignatureLineBreaks(xml: string): string {
  return xml.replace(/<p:txBody>[\s\S]*?<\/p:txBody>/g, (body) => {
    if (!/_{5,}/.test(textNodes(body).join(""))) return body;

    return body.replace(/<a:p>[\s\S]*?<\/a:p>/g, (paragraph) => {
      if (/<a:br\b/.test(paragraph)) return paragraph;

      const runs = [...paragraph.matchAll(/<a:r>([\s\S]*?)<\/a:r>/g)];
      const lineIndex = runs.findIndex((run) => {
        const text = textNodes(run[0]).join("");
        return /_{5,}/.test(text) && !/[A-Za-zÀ-ÿ]/.test(text);
      });
      if (lineIndex < 0) return paragraph;

      const nameRun = runs
        .slice(lineIndex + 1)
        .find((run) => isLikelyPersonName(textNodes(run[0]).join("").trim()));
      if (!nameRun || nameRun.index === undefined) return paragraph;

      const lineRun = runs[lineIndex][0];
      const size = lineRun.match(/<a:rPr\b[^>]*\ssz="(\d+)"/)?.[1] ?? "1400";
      const breakXml = `<a:br><a:rPr sz="${size}"/></a:br>`;
      return paragraph.slice(0, nameRun.index) + breakXml + paragraph.slice(nameRun.index);
    });
  });
}

export function replaceInstructorSignatureBody(body: string, replacement: string): string {
  const bodyText = textNodes(body).join(" ");
  if (
    /COLABORADOR|CPF|CERTIFIC|PARTICIPOU|CONTE[ÚU]DO|PROGRAM[ÁA]TICO|VOLGA|CNPJ/i.test(bodyText)
  ) {
    return body;
  }

  let replaced = false;
  let out = body.replace(/<a:t>([\s\S]*?)<\/a:t>/g, (m, raw) => {
    if (replaced) return m;
    const text = xmlUnescape(String(raw));
    if (!isLikelyPersonName(text)) return m;
    const lead = text.match(/^[\s_]+/)?.[0] ?? "";
    const tail = text.match(/\s*$/)?.[0] ?? "";
    replaced = true;
    return `<a:t>${xmlEscape(`${lead}${replacement}${tail}`)}</a:t>`;
  });
  if (replaced) {
    out = preventWrap(out);
  }
  return out;
}

export function patchInstructorLabelBody(body: string, shared: SharedFields): string {
  const bodyText = textNodes(body).join(" ");
  if (!/(INSTRUTOR|RESPONS[ÁA]VEL T[ÉE]CNICO)/i.test(bodyText)) return body;

  let consumedReg = false;
  let cargoDone = false;
  const out = body.replace(/<a:t>([\s\S]*?)<\/a:t>/g, (m, raw) => {
    const text = xmlUnescape(String(raw));
    const trimmed = text.trim();

    const regLabelMatch = trimmed.match(/^(REG|CREA)\s*:/i);
    if (regLabelMatch) {
      consumedReg = true;
      const label = regLabelMatch[1].toUpperCase() === "CREA" ? "CREA" : "Reg";
      return `<a:t>${xmlEscape(`${label}: ${shared.instrutorRegistro.trim()}`)}</a:t>`;
    }

    if (consumedReg && /^[\s:/.\-A-Z0-9]+$/i.test(trimmed)) {
      return "<a:t></a:t>";
    }

    if (!cargoDone && isLikelyCargoLine(trimmed)) {
      cargoDone = true;
      const lead = text.match(/^\s*/)?.[0] ?? "";
      const tail = text.match(/\s*$/)?.[0] ?? "";
      return `<a:t>${xmlEscape(`${lead}${shared.instrutorCargo.trim()}${tail}`)}</a:t>`;
    }

    return m;
  });
  return out === body ? body : preventWrap(out);
}

export type InstructorFields = { nome: string; cargo: string; registro: string };

/**
 * Retorna a posição da forma que contém um txBody. Em alguns modelos o nome
 * aparece antes do rótulo no XML, e em outros aparece depois; a proximidade
 * visual é a forma confiável de associar nome, cargo e registro.
 */
function txBodyPosition(
  xml: string,
  txBodyStart: number,
): { x: number; y: number; cx: number } | null {
  const shapeStart = xml.lastIndexOf("<p:sp>", txBodyStart);
  if (shapeStart < 0 || xml.indexOf("</p:sp>", shapeStart) < txBodyStart) return null;
  const shape = xml.slice(shapeStart, txBodyStart);
  const off = shape.match(/<a:off\s+x="(\d+)"\s+y="(\d+)"/);
  const ext = shape.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/);
  if (!off || !ext) return null;
  return { x: Number(off[1]), y: Number(off[2]), cx: Number(ext[1]) };
}

function instructorLabels(matches: RegExpMatchArray[]): number[] {
  return matches.flatMap((match, index) =>
    /(?:INSTRUTOR|RESPONS[ÁA]VEL\s*T[ÉE]CNICO)/i.test(textNodes(match[0]).join(" ")) ? [index] : [],
  );
}

function signatureCandidates(
  xml: string,
  matches: RegExpMatchArray[],
  labelIndex: number,
  claimed: Set<number>,
): number[] {
  const positions = matches.map((m) => txBodyPosition(xml, m.index ?? 0));
  const label = positions[labelIndex];
  return matches
    .map((m, index) => index)
    .filter((index) => {
      if (index === labelIndex || claimed.has(index)) return false;
      const body = matches[index][0];
      if (replaceInstructorSignatureBody(body, "Nome de Teste") === body) return false;
      const pos = positions[index];
      if (!label || !pos) return index < labelIndex && index >= labelIndex - 10;
      // Assinatura sempre acima do cargo. Nunca tocar a assinatura de aluno
      // na primeira coluna ou a assinatura da coluna vizinha.
      const centerDelta = Math.abs(pos.x + pos.cx / 2 - (label.x + label.cx / 2));
      return pos.y <= label.y && label.y - pos.y < 1100000 && centerDelta < 1700000;
    })
    .sort((a, b) => {
      const aPos = positions[a],
        bPos = positions[b];
      const score = (pos: typeof label, i: number) =>
        label && pos
          ? Math.abs(pos.x + pos.cx / 2 - label.x - label.cx / 2) + Math.abs(pos.y - label.y)
          : Math.abs(i - labelIndex) * 1000000;
      return score(aPos, a) - score(bPos, b);
    });
}

/** A assinatura central corresponde à coluna de instrutor mais à esquerda,
 * independentemente da ordem dos elementos no arquivo. */
export function patchInstructorBlocks(
  xml: string,
  shared: SharedFields,
  meio?: InstructorFields | null,
): string {
  const matches = [...xml.matchAll(/<p:txBody>[\s\S]*?<\/p:txBody>/g)];
  if (!matches.length) return xml;
  const labels = instructorLabels(matches);
  const positions = matches.map((match) => txBodyPosition(xml, match.index ?? 0));
  const sorted = [...labels].sort(
    (a, b) => (positions[a]?.x ?? a * 1000000) - (positions[b]?.x ?? b * 1000000),
  );
  const middle = sorted.length > 1 ? sorted[0] : -1;
  const replacements = new Map<number, string>();
  const claimed = new Set<number>(labels);
  for (const i of labels) {
    const fields: SharedFields =
      i === middle && meio
        ? {
            ...shared,
            instrutorNome: meio.nome,
            instrutorCargo: meio.cargo,
            instrutorRegistro: meio.registro,
          }
        : shared;
    replacements.set(i, patchInstructorLabelBody(matches[i][0], fields));
    const candidate = signatureCandidates(xml, matches, i, claimed)[0];
    if (candidate !== undefined) {
      claimed.add(candidate);
      replacements.set(
        candidate,
        replaceInstructorSignatureBody(matches[candidate][0], instructorDisplayName(fields)),
      );
    }
  }
  let out = "",
    cursor = 0;
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i],
      start = m.index ?? 0;
    out += xml.slice(cursor, start) + (replacements.get(i) ?? m[0]);
    cursor = start + m[0].length;
  }
  return out + xml.slice(cursor);
}

/** Protege nomes nas caixas das assinaturas ao atualizar o colaborador. */
function findInstructorTxBodyIndices(xml: string, matches: RegExpMatchArray[]): Set<number> {
  const labels = instructorLabels(matches);
  const skip = new Set(labels);
  for (const i of labels) {
    const candidate = signatureCandidates(xml, matches, i, skip)[0];
    if (candidate !== undefined) skip.add(candidate);
  }
  return skip;
}

function patchOriginalFrontSlide(xml: string, col: Colaborador): string {
  const nomeUpper = col.nome.trim().toUpperCase();
  const nomeSig = titleCase(col.nome.trim());
  const cpf = col.cpf.trim();

  const out = xml.replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, xmlEscape(cpf));

  const matches = [...out.matchAll(/<p:txBody>[\s\S]*?<\/p:txBody>/g)];
  if (!matches.length) return out;
  const skip = findInstructorTxBodyIndices(out, matches);

  // Coleta nomes originais em CAIXA ALTA que aparecem em nós individuais
  // (o cabeçalho normalmente tem o nome grande em UPPERCASE dentro de um txBody
  // maior, junto com título/CPF, e não como um txBody isolado só de nome).
  const uppercaseOriginals = new Set<string>();
  for (let i = 0; i < matches.length; i++) {
    if (skip.has(i)) continue;
    for (const t of textNodes(matches[i][0])) {
      const trimmed = t.trim();
      if (isLikelyUpperPersonName(trimmed)) uppercaseOriginals.add(trimmed);
    }
  }

  // Reescreve cada txBody:
  //  - blocos do instrutor: intocados
  //  - txBody que é APENAS um nome próprio (assinatura do aluno, cabeçalho só
  //    com o nome, etc.) → vira o nome do aluno no mesmo formato (upper/title)
  //  - demais txBodies: substitui inline as ocorrências dos nomes originais
  //    em caixa alta pelo nome do aluno em caixa alta
  let cursor = 0;
  let result = "";
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = m.index ?? 0;
    result += out.slice(cursor, start);
    let body = m[0];

    if (!skip.has(i)) {
      const bodyText = textNodes(body).join("").trim();
      // Caixas com linha de assinatura (sublinhados) não são "nome puro":
      // o nome precisa ficar na linha própria, abaixo dos sublinhados.
      const isSignatureLineBox = /_{5,}/.test(bodyText);
      if (bodyText && !isSignatureLineBox && isLikelyUpperPersonName(bodyText)) {
        body = rewriteBareNameBody(body, nomeUpper);
      } else if (bodyText && !isSignatureLineBox && isLikelyPersonName(bodyText)) {
        body = rewriteBareNameBody(body, nomeSig);
      } else if (uppercaseOriginals.size) {
        // Substitui ocorrências inline (nome próprio dentro de txBody maior).
        const hasSigLine = /_{5,}/.test(textNodes(body).join(""));
        // Na linha de assinatura do colaborador, o nome usa o mesmo corpo da
        // linha de sublinhados (alguns modelos trazem o nome em corpo menor).
        const sigLineSz = hasSigLine
          ? body.match(/<a:rPr[^>]*\ssz="(\d+)"[^>]*>(?:(?!<a:r[ >]).)*?<a:t>\s*_{5,}/)?.[1]
          : undefined;
        for (const original of uppercaseOriginals) {
          body = body.replace(
            /(<a:rPr\b[\s\S]*?<\/a:rPr>|<a:rPr\b[^>]*\/>)?<a:t>([\s\S]*?)<\/a:t>/g,
            (mm, rpr: string | undefined, raw) => {
              const text = xmlUnescape(String(raw));
              if (normalizeText(text) !== normalizeText(original)) return mm;
              const lead = text.match(/^\s*/)?.[0] ?? "";
              const tail = text.match(/\s*$/)?.[0] ?? "";
              let open = rpr ?? "";
              // Na linha de assinatura o nome segue o estilo dos demais
              // signatários: caixa alta e mesmo corpo da linha de sublinhados.
              const isSigName = Boolean(sigLineSz) && !isLikelyUpperPersonName(text.trim());
              if (isSigName && open) {
                open = open.replace(/\ssz="\d+"/, ` sz="${sigLineSz}"`);
              }
              const replacement = isSigName ? nomeSig : nomeUpper;
              return `${open}<a:t>${xmlEscape(`${lead}${replacement}${tail}`)}</a:t>`;
            },
          );
        }
      }
      if (body !== m[0]) body = preventWrap(body);
    }

    result += body;
    cursor = start + m[0].length;
  }
  result += out.slice(cursor);
  return normalizeSignatureLineBreaks(result);
}

/**
 * Substitui o instrutor "assado" no XML de um slide pelo instrutor
 * informado no formulário. Cobre o nome (título e caixa alta), o cargo e
 * a linha "Reg: XXXX/UF". A base é o instrutor built-in do template
 * original (identificado pela URL); quando não há base disponível, também
 * tenta substituir o instrutor default do template Volga NR-06.
 */
function applyInstructorToSlideXml(
  xml: string,
  shared: SharedFields,
  baked: { nome: string; cargo: string; registro: string } | null,
): string {
  let out = xml;
  const newNome = shared.instrutorNome.trim();
  const newCargo = shared.instrutorCargo.trim();
  const newReg = shared.instrutorRegistro.trim();
  if (!newNome && !newCargo && !newReg) return out;

  const bases: Array<{ nome: string; cargo: string; registro: string }> = [];
  if (baked) bases.push(baked);
  // Fallback: template Volga NR-06 default (ORIGINAL_INSTRUTOR / cargo).
  bases.push({
    nome: ORIGINAL_INSTRUTOR,
    cargo: ORIGINAL_INSTRUTOR_CARGO.trim(),
    registro: "0028038/GO",
  });

  for (const base of bases) {
    const bakedNome = base.nome.trim();
    if (bakedNome && newNome) {
      const titleTarget = instructorDisplayName(shared);
      out = replaceAll(out, xmlEscape(bakedNome), xmlEscape(titleTarget));
      out = replaceAll(out, xmlEscape(bakedNome.toUpperCase()), xmlEscape(newNome.toUpperCase()));
    }
    const bakedCargo = base.cargo.trim();
    if (bakedCargo && newCargo) {
      out = replaceAll(out, xmlEscape(bakedCargo), xmlEscape(newCargo));
    }
    const bakedReg = base.registro.trim();
    if (bakedReg && newReg) {
      out = replaceAll(out, xmlEscape(bakedReg), xmlEscape(newReg));
    }
    out = replaceNormalizedText(out, bakedNome, instructorDisplayName(shared));
    out = replaceNormalizedText(out, bakedNome.toUpperCase(), newNome.toUpperCase());
  }

  const meioNome = (shared.instrutorMeioNome ?? "").trim();
  const meio: InstructorFields | null = meioNome
    ? {
        nome: meioNome,
        cargo: (shared.instrutorMeioCargo ?? "").trim(),
        registro: (shared.instrutorMeioRegistro ?? "").trim(),
      }
    : null;

  out = patchInstructorBlocks(out, shared, meio);
  out = normalizeSignatureLineBreaks(out);
  return fitNoWrapBodies(stabilizeSignatureNameBodies(out, [newNome, meioNome]));
}

/** Largura média aproximada (em fração do corpo) de um caractere em sans-serif. */
function charWidth(ch: string): number {
  if (ch === " ") return 0.28;
  if (/[iljtfI.,:;'|!]/.test(ch)) return 0.3;
  if (/[mwMW]/.test(ch)) return 0.85;
  if (/[A-ZÀ-Ý]/.test(ch)) return 0.72;
  if (/[0-9]/.test(ch)) return 0.56;
  if (ch === "_") return 0.56;
  return 0.54;
}

export function estimateTextWidthEmu(text: string, szHundredths: number, bold: boolean): number {
  let units = 0;
  for (const ch of text) units += charWidth(ch);
  if (bold) units *= 1.07;
  return units * (szHundredths / 100) * 12700;
}

/**
 * Para caixas sem quebra de linha (nomes de assinatura, nome do aluno),
 * mede cada linha e, quando ela ultrapassaria a largura da caixa, reduz o
 * corpo da fonte dessa linha até caber — evitando sobreposição com textos
 * vizinhos sem depender do autoajuste do PowerPoint/LibreOffice.
 */
export function fitNoWrapBodies(xml: string, minSz = 800): string {
  return xml.replace(/<p:sp>[\s\S]*?<\/p:sp>/g, (shape) => {
    const bodyPr = shape.match(/<a:bodyPr([^>]*)>/);
    if (!bodyPr || !/wrap="none"/.test(bodyPr[1])) return shape;
    const ext = shape.match(/<a:ext\s+cx="(\d+)"/);
    if (!ext) return shape;
    const lIns = Number(bodyPr[1].match(/lIns="(\d+)"/)?.[1] ?? 91440);
    const rIns = Number(bodyPr[1].match(/rIns="(\d+)"/)?.[1] ?? 91440);
    const avail = (Number(ext[1]) - lIns - rIns) * 0.97;
    if (avail <= 0) return shape;
    const defSz = Number(shape.match(/<a:defRPr[^>]*\ssz="(\d+)"/)?.[1] ?? 1800);
    return shape.replace(/<a:p>[\s\S]*?<\/a:p>/g, (wholePara) =>
      wholePara
        .split(/(<a:br\b[^>]*?(?:\/>|>[\s\S]*?<\/a:br>))/)
        .map((para) => {
          const runs = [
            ...para.matchAll(
              /<a:r>(?:(<a:rPr\b[^>]*\/>|<a:rPr\b[^>]*>[\s\S]*?<\/a:rPr>))?\s*<a:t>([\s\S]*?)<\/a:t><\/a:r>/g,
            ),
          ];
          if (!runs.length) return para;
          let width = 0,
            maxSz = 0;
          for (const r of runs) {
            const rpr = r[1] ?? "";
            const sz = Number(rpr.match(/\ssz="(\d+)"/)?.[1] ?? defSz);
            maxSz = Math.max(maxSz, sz);
            width += estimateTextWidthEmu(
              xmlUnescape(r[2]).replace(/^\s+|\s+$/g, " "),
              sz,
              /\sb="1"/.test(rpr),
            );
          }
          if (width <= avail) return para;
          const scale = avail / width;
          return para.replace(
            /<a:r>(?:(<a:rPr\b[^>]*\/>|<a:rPr\b[^>]*>[\s\S]*?<\/a:rPr>))?\s*<a:t>/g,
            (_m, rpr: string | undefined) => {
              const cur = Number(rpr?.match(/\ssz="(\d+)"/)?.[1] ?? defSz);
              const next = Math.max(minSz, Math.floor((cur * scale) / 50) * 50);
              let open = rpr ?? '<a:rPr lang="pt-BR"/>';
              open = /\ssz="\d+"/.test(open)
                ? open.replace(/\ssz="\d+"/, ` sz="${next}"`)
                : open.replace(/<a:rPr\b/, `<a:rPr sz="${next}"`);
              return `<a:r>${open}<a:t>`;
            },
          );
        })
        .join(""),
    );
  });
}

/**
 * Aplica o instrutor escolhido no formulário a todos os slides do PPTX
 * original, garantindo que todos os certificados saiam com o mesmo
 * instrutor mesmo quando o modelo built-in já vem com um instrutor
 * "assado" no arquivo.
 */
function applyInstructorToAllOriginalSlides(zip: PizZip, shared: SharedFields): void {
  const baked = getOriginalInstructorByTemplateUrl(shared.templateUrl);
  for (const n of slideNumbers(zip)) {
    const path = `ppt/slides/slide${n}.xml`;
    const f = zip.file(path);
    if (!f) continue;
    const patched = replaceDatesInSlideXml(
      applyInstructorToSlideXml(f.asText(), shared, baked),
      shared.data,
    );
    zip.file(path, patched);
  }
}

function buildBlobFromOriginalTemplate(
  templateBuf: ArrayBuffer,
  shared: SharedFields,
  colaboradores: Colaborador[],
): Blob {
  const zip = new PizZip(templateBuf);
  const nums = slideNumbers(zip);
  const pairCount = Math.max(1, Math.floor(nums.length / 2));
  const used = Math.min(colaboradores.length, pairCount);
  const keep = new Set<number>();

  for (let i = 0; i < used; i++) {
    const front = nums[i * 2];
    const back = nums[i * 2 + 1];
    if (front) {
      keep.add(front);
      const file = zip.file(`ppt/slides/slide${front}.xml`);
      if (file)
        zip.file(
          `ppt/slides/slide${front}.xml`,
          patchOriginalFrontSlide(file.asText(), colaboradores[i]),
        );
    }
    if (back) keep.add(back);
  }

  removeSlidesNotIn(zip, keep);
  applyInstructorToAllOriginalSlides(zip, shared);
  standardizeCertificateSlides(zip);
  return zip.generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    compression: "DEFLATE",
  });
}

/**
 * Constrói UM único PPTX contendo todos os colaboradores, duplicando o
 * conjunto de slides do template original quantas vezes forem necessárias.
 */
function buildMergedOriginalPptx(
  templateBuf: ArrayBuffer,
  shared: SharedFields,
  colaboradores: Colaborador[],
): Blob {
  const zip = new PizZip(templateBuf);
  const nums = slideNumbers(zip);
  const pairCount = Math.max(1, Math.floor(nums.length / 2));

  // Captura XML e rels originais de cada slide antes de qualquer edição.
  const origXml: Record<number, string> = {};
  const origRels: Record<number, string | null> = {};
  for (const n of nums) {
    const f = zip.file(`ppt/slides/slide${n}.xml`);
    const r = zip.file(`ppt/slides/_rels/slide${n}.xml.rels`);
    origXml[n] = f ? f.asText() : "";
    origRels[n] = r ? r.asText() : null;
  }

  const chunks: Colaborador[][] = [];
  for (let i = 0; i < colaboradores.length; i += pairCount) {
    chunks.push(colaboradores.slice(i, i + pairCount));
  }

  // Primeiro chunk: sobrescreve os slides existentes in-place.
  const first = chunks[0];
  const keep = new Set<number>();
  for (let i = 0; i < first.length; i++) {
    const front = nums[i * 2];
    const back = nums[i * 2 + 1];
    if (front) {
      keep.add(front);
      zip.file(`ppt/slides/slide${front}.xml`, patchOriginalFrontSlide(origXml[front], first[i]));
    }
    if (back) keep.add(back);
  }
  removeSlidesNotIn(zip, keep);

  if (chunks.length > 1) {
    const presRelsFile = zip.file("ppt/_rels/presentation.xml.rels");
    const presFile = zip.file("ppt/presentation.xml");
    const ctFile = zip.file("[Content_Types].xml");
    if (presRelsFile && presFile && ctFile) {
      let presRelsText = presRelsFile.asText();
      let presText = presFile.asText();
      let ctText = ctFile.asText();

      let maxRid = 0;
      for (const m of presRelsText.matchAll(/Id="rId(\d+)"/g)) {
        maxRid = Math.max(maxRid, parseInt(m[1], 10));
      }
      let maxSldId = 255;
      for (const m of presText.matchAll(/<p:sldId id="(\d+)"/g)) {
        maxSldId = Math.max(maxSldId, parseInt(m[1], 10));
      }
      let nextSlideNum = Math.max(...nums) + 1;

      const relsInserts: string[] = [];
      const sldIdInserts: string[] = [];
      const overrideInserts: string[] = [];

      const addSlide = (xml: string, rels: string | null): number => {
        const newN = nextSlideNum++;
        zip.file(`ppt/slides/slide${newN}.xml`, xml);
        if (rels) zip.file(`ppt/slides/_rels/slide${newN}.xml.rels`, rels);
        maxRid += 1;
        maxSldId += 1;
        relsInserts.push(
          `<Relationship Id="rId${maxRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${newN}.xml"/>`,
        );
        sldIdInserts.push(`<p:sldId id="${maxSldId}" r:id="rId${maxRid}"/>`);
        overrideInserts.push(
          `<Override PartName="/ppt/slides/slide${newN}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
        );
        return newN;
      };

      for (let ci = 1; ci < chunks.length; ci++) {
        const chunk = chunks[ci];
        for (let i = 0; i < chunk.length; i++) {
          const frontOrig = nums[i * 2];
          const backOrig = nums[i * 2 + 1];
          if (frontOrig) {
            addSlide(patchOriginalFrontSlide(origXml[frontOrig], chunk[i]), origRels[frontOrig]);
          }
          if (backOrig) {
            addSlide(origXml[backOrig], origRels[backOrig]);
          }
        }
      }

      if (relsInserts.length) {
        presRelsText = presRelsText.replace(
          "</Relationships>",
          relsInserts.join("") + "</Relationships>",
        );
        presText = presText.replace("</p:sldIdLst>", sldIdInserts.join("") + "</p:sldIdLst>");
        ctText = ctText.replace("</Types>", overrideInserts.join("") + "</Types>");
        zip.file("ppt/_rels/presentation.xml.rels", presRelsText);
        zip.file("ppt/presentation.xml", presText);
        zip.file("[Content_Types].xml", ctText);
      }
    }
  }

  applyInstructorToAllOriginalSlides(zip, shared);
  standardizeCertificateSlides(zip);
  return zip.generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    compression: "DEFLATE",
  });
}

export function safeFileName(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "certificado"
  );
}

async function generateOriginalPptx(
  shared: SharedFields,
  cols: Colaborador[],
  fileName: string,
  opts: GenerateOptions,
): Promise<{ chunks: number; format: "pptx" | "zip" }> {
  const templateBuf = await fetchTemplateBuffer(templateUrlFor(shared), "o modelo original");

  const base = fileName.replace(/\.pptx$/i, "");
  const courseSlug = safeFileName(shared.treinamento || base);

  // Modo "um arquivo por pessoa": ZIP com um PPTX individual para cada colaborador,
  // nomeado como "<curso>-<nome>.pptx".
  if (opts.perPerson) {
    const zip = new PizZip();
    opts.onProgress?.(0, cols.length);
    const used = new Map<string, number>();
    for (let i = 0; i < cols.length; i++) {
      throwIfAborted(opts.signal);
      const col = cols[i];
      const blob = buildBlobFromOriginalTemplate(templateBuf.slice(0), shared, [col]);
      const personSlug = safeFileName(col.nome) || `colaborador-${i + 1}`;
      let name = `${courseSlug}-${personSlug}.pptx`;
      // desambigua homônimos
      const key = name.toLowerCase();
      const n = (used.get(key) ?? 0) + 1;
      used.set(key, n);
      if (n > 1) name = `${courseSlug}-${personSlug}-${n}.pptx`;
      zip.file(name, await blob.arrayBuffer());
      opts.onProgress?.(i + 1, cols.length);
      await new Promise((r) => setTimeout(r, 0));
    }
    saveAs(
      zip.generate({ type: "blob", mimeType: "application/zip", compression: "DEFLATE" }),
      `${courseSlug}-por-pessoa.zip`,
    );
    return { chunks: cols.length, format: "zip" };
  }

  // Modo padrão: TUDO junto num único PPTX (duplica slides quando necessário).
  const pairCount = Math.max(
    1,
    Math.floor(slideNumbers(new PizZip(templateBuf.slice(0))).length / 2),
  );
  const totalChunks = Math.max(1, Math.ceil(cols.length / pairCount));
  opts.onProgress?.(0, totalChunks);
  const blob = buildMergedOriginalPptx(templateBuf, shared, cols);
  opts.onProgress?.(totalChunks, totalChunks);
  saveAs(blob, `${courseSlug}.pptx`);
  return { chunks: totalChunks, format: "pptx" };
}

async function generateOriginalBatchArchive(
  entries: BatchEntry[],
  fileName: string,
  opts: BatchOptions = {},
): Promise<{ units: number; entries: number; failed: BatchFailure[] }> {
  const pptxParts: Blob[] = [];
  const failed: BatchFailure[] = [];
  let units = 0;
  // Estimativa de total para a barra de progresso (5 por unidade é o pior caso).
  const totalEstimate = Math.max(
    1,
    entries.reduce(
      (acc, e) => acc + Math.ceil(Math.max(1, onlyIncluded(e.cols).length) / CHUNK_SIZE),
      0,
    ),
  );
  opts.onProgress?.(0, totalEstimate);

  for (const [entryIndex, entry] of entries.entries()) {
    throwIfAborted(opts.signal);
    const label = entry.name || entry.shared.treinamento || `Modelo ${entryIndex + 1}`;
    try {
      const cols = onlyIncluded(entry.cols).slice(0, MAX_COLABORADORES);
      if (cols.length === 0) continue;

      const templateBuf = await fetchTemplateBuffer(
        templateUrlFor(entry.shared),
        `o modelo "${label}"`,
      );
      const original = isOriginalTemplate(entry.shared);
      const pairCount = original
        ? Math.max(1, Math.floor(slideNumbers(new PizZip(templateBuf.slice(0))).length / 2))
        : CHUNK_SIZE;

      for (let i = 0; i < cols.length; i += pairCount) {
        throwIfAborted(opts.signal);
        opts.onCurrent?.(
          label,
          cols[i]?.nome || "Colaborador sem nome",
          Math.floor(i / pairCount) + 1,
        );
        const chunk = cols.slice(i, i + pairCount);
        const blob = original
          ? buildBlobFromOriginalTemplate(templateBuf.slice(0), entry.shared, chunk)
          : buildBlobFromTemplate(templateBuf.slice(0), entry.shared, chunk);
        pptxParts.push(blob);
        units += 1;
        opts.onProgress?.(units, Math.max(totalEstimate, units));
        await new Promise((r) => setTimeout(r, 0));
      }
    } catch (err) {
      if (err instanceof GenerationAbortedError) throw err;
      // Um modelo com problema não derruba o lote inteiro.
      console.error(`Falha no modelo "${label}":`, err);
      failed.push({ name: label, error: err instanceof Error ? err.message : String(err) });
    }
  }
  if (units === 0) {
    if (failed.length) {
      throw new Error(`Nenhum modelo pôde ser gerado. Primeiro erro: ${failed[0].error}`);
    }
    throw new Error("Nenhum colaborador preenchido");
  }
  throwIfAborted(opts.signal);
  const baseName = fileName.replace(/\.pptx$/i, "");
  const merged = await mergePptxBlobs(pptxParts);
  saveAs(merged, `${baseName}.pptx`);
  return { units, entries: entries.length, failed };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function relsPathForPart(partPath: string): string {
  const slash = partPath.lastIndexOf("/");
  const dir = slash >= 0 ? partPath.slice(0, slash) : "";
  const file = slash >= 0 ? partPath.slice(slash + 1) : partPath;
  return `${dir}/_rels/${file}.rels`;
}

function dirname(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash >= 0 ? path.slice(0, slash) : "";
}

function basename(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash >= 0 ? path.slice(slash + 1) : path;
}

function extension(path: string): string {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot) : "";
}

function resolveTarget(fromPart: string, target: string): string {
  const stack = dirname(fromPart).split("/").filter(Boolean);
  for (const piece of target.split("/")) {
    if (!piece || piece === ".") continue;
    if (piece === "..") stack.pop();
    else stack.push(piece);
  }
  return stack.join("/");
}

function relativeTarget(fromPart: string, toPart: string): string {
  const from = dirname(fromPart).split("/").filter(Boolean);
  const to = toPart.split("/").filter(Boolean);
  while (from.length && to.length && from[0] === to[0]) {
    from.shift();
    to.shift();
  }
  return [...from.map(() => ".."), ...to].join("/") || basename(toPart);
}

function uniquePartPath(zip: PizZip, preferred: string, group: number): string {
  if (!zip.file(preferred)) return preferred;
  const dir = dirname(preferred);
  const name = basename(preferred);
  const ext = extension(name);
  const stem = ext ? name.slice(0, -ext.length) : name;
  let i = 1;
  let next = `${dir}/merged${group}_${stem}${ext}`;
  while (zip.file(next)) {
    i += 1;
    next = `${dir}/merged${group}_${stem}_${i}${ext}`;
  }
  return next;
}

function addContentTypeForPart(
  contentTypes: string,
  sourceContentTypes: string,
  sourcePart: string,
  targetPart: string,
): string {
  const sourcePartName = `/${sourcePart}`;
  const targetPartName = `/${targetPart}`;
  if (contentTypes.includes(`PartName="${targetPartName}"`)) return contentTypes;

  const override = sourceContentTypes.match(
    new RegExp(
      `<Override\\s+PartName="${escapeRegExp(sourcePartName)}"\\s+ContentType="([^"]+)"\\s*/>`,
    ),
  );
  if (override) {
    return contentTypes.replace(
      "</Types>",
      `<Override PartName="${targetPartName}" ContentType="${override[1]}"/></Types>`,
    );
  }

  const ext = extension(sourcePart).replace(/^\./, "");
  if (!ext || contentTypes.includes(`Extension="${ext}"`)) return contentTypes;
  const defaultMatch = sourceContentTypes.match(
    new RegExp(`<Default\\s+Extension="${escapeRegExp(ext)}"\\s+ContentType="([^"]+)"\\s*/>`),
  );
  if (!defaultMatch) return contentTypes;
  return contentTypes.replace(
    "</Types>",
    `<Default Extension="${ext}" ContentType="${defaultMatch[1]}"/></Types>`,
  );
}

function copyPartWithDependencies(
  source: PizZip,
  target: PizZip,
  sourcePart: string,
  preferredTargetPart: string,
  sourceContentTypes: string,
  group: number,
  map: Map<string, string>,
  contentTypesRef: { value: string },
): string {
  const mapped = map.get(sourcePart);
  if (mapped) return mapped;
  const srcFile = source.file(sourcePart);
  if (!srcFile) return preferredTargetPart;

  const targetPart = uniquePartPath(target, preferredTargetPart, group);
  map.set(sourcePart, targetPart);
  target.file(targetPart, srcFile.asUint8Array());
  contentTypesRef.value = addContentTypeForPart(
    contentTypesRef.value,
    sourceContentTypes,
    sourcePart,
    targetPart,
  );

  const srcRelsPath = relsPathForPart(sourcePart);
  const srcRels = source.file(srcRelsPath)?.asText();
  if (srcRels) {
    const patchedRels = srcRels.replace(
      /<Relationship\b([^>]*)Target="([^"]+)"([^>]*)\/>/g,
      (m, before, rawTarget, after) => {
        const attrs = `${before}${after}`;
        if (/TargetMode="External"/i.test(attrs)) return m;
        const depSourcePart = resolveTarget(sourcePart, rawTarget);
        if (!source.file(depSourcePart)) return m;
        const depTargetPart = copyPartWithDependencies(
          source,
          target,
          depSourcePart,
          uniquePartPath(target, depSourcePart, group),
          sourceContentTypes,
          group,
          map,
          contentTypesRef,
        );
        return `<Relationship${before}Target="${relativeTarget(targetPart, depTargetPart)}"${after}/>`;
      },
    );
    target.file(relsPathForPart(targetPart), patchedRels);
  }

  return targetPart;
}

function appendPptxSlides(base: PizZip, addition: PizZip, group: number): void {
  const basePresRelsFile = base.file("ppt/_rels/presentation.xml.rels");
  const basePresFile = base.file("ppt/presentation.xml");
  const baseCtFile = base.file("[Content_Types].xml");
  const addCtFile = addition.file("[Content_Types].xml");
  if (!basePresRelsFile || !basePresFile || !baseCtFile || !addCtFile) {
    throw new Error("Modelo inválido para mesclar no lote.");
  }

  let presRelsText = basePresRelsFile.asText();
  let presText = basePresFile.asText();
  const contentTypesRef = { value: baseCtFile.asText() };
  const addContentTypes = addCtFile.asText();

  let maxRid = 0;
  for (const m of presRelsText.matchAll(/Id="rId(\d+)"/g))
    maxRid = Math.max(maxRid, parseInt(m[1], 10));
  let maxSldId = 255;
  for (const m of presText.matchAll(/<p:sldId id="(\d+)"/g))
    maxSldId = Math.max(maxSldId, parseInt(m[1], 10));
  let nextSlideNum = Math.max(0, ...slideNumbers(base)) + 1;

  const map = new Map<string, string>();
  const relsInserts: string[] = [];
  const sldIdInserts: string[] = [];

  for (const n of slideNumbers(addition)) {
    const sourcePart = `ppt/slides/slide${n}.xml`;
    const targetPart = `ppt/slides/slide${nextSlideNum++}.xml`;
    const copiedPart = copyPartWithDependencies(
      addition,
      base,
      sourcePart,
      targetPart,
      addContentTypes,
      group,
      map,
      contentTypesRef,
    );
    maxRid += 1;
    maxSldId += 1;
    relsInserts.push(
      `<Relationship Id="rId${maxRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="${relativeTarget("ppt/presentation.xml", copiedPart)}"/>`,
    );
    sldIdInserts.push(`<p:sldId id="${maxSldId}" r:id="rId${maxRid}"/>`);
  }

  if (relsInserts.length) {
    presRelsText = presRelsText.replace(
      "</Relationships>",
      relsInserts.join("") + "</Relationships>",
    );
    presText = presText.replace("</p:sldIdLst>", sldIdInserts.join("") + "</p:sldIdLst>");
    base.file("ppt/_rels/presentation.xml.rels", presRelsText);
    base.file("ppt/presentation.xml", presText);
    base.file("[Content_Types].xml", contentTypesRef.value);
  }
}

async function mergePptxBlobs(blobs: Blob[]): Promise<Blob> {
  if (!blobs.length) throw new Error("Nenhum arquivo para mesclar");
  const base = new PizZip(await blobs[0].arrayBuffer());
  for (let i = 1; i < blobs.length; i++) {
    appendPptxSlides(base, new PizZip(await blobs[i].arrayBuffer()), i + 1);
    await new Promise((r) => setTimeout(r, 0));
  }
  return base.generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    compression: "DEFLATE",
  });
}

/** Mantém só colaboradores com nome preenchido e não desmarcados na lista. */
function onlyIncluded(colaboradores: Colaborador[]): Colaborador[] {
  return colaboradores
    .map(normalizeCollaboratorIdentity)
    .filter((c) => c.nome.trim() && c.incluir !== false);
}

/**
 * Remove do zip os pares de slide (frente + verso) dos slots do template que
 * não têm colaborador correspondente (slotIdx >= usedCount). Sem isso, um
 * arquivo com menos de 5 colaboradores manteria certificados de exemplo do
 * próprio template (com nome e CPF reais de pessoas) — um vazamento de dados
 * além de gerar arquivos com certificados a mais do que o pedido.
 */
function removeUnusedSlots(zip: PizZip, usedCount: number): void {
  if (usedCount >= SLOTS.length) return;

  const presRelsFile = zip.file("ppt/_rels/presentation.xml.rels");
  const presFile = zip.file("ppt/presentation.xml");
  const ctFile = zip.file("[Content_Types].xml");
  if (!presRelsFile || !presFile || !ctFile) return; // defensivo: não derruba a geração por causa disso

  let presRelsText = presRelsFile.asText();
  let presText = presFile.asText();
  let ctText = ctFile.asText();

  for (let i = usedCount; i < SLOTS.length; i++) {
    const frontMatch = SLOTS[i].slideFile.match(/slide(\d+)\.xml$/);
    if (!frontMatch) continue;
    const front = parseInt(frontMatch[1], 10);
    const back = front + 1; // verso do certificado, imediatamente após a frente

    for (const n of [front, back]) {
      const slidePath = `ppt/slides/slide${n}.xml`;
      const relsPath = `ppt/slides/_rels/slide${n}.xml.rels`;

      const relRe = new RegExp(
        `<Relationship Id="(rId\\d+)"[^>]*Target="slides/slide${n}\\.xml"[^>]*/>`,
      );
      const relMatch = presRelsText.match(relRe);
      if (relMatch) {
        const rId = relMatch[1];
        presRelsText = presRelsText.replace(relMatch[0], "");
        const sldRe = new RegExp(`<p:sldId[^>]*r:id="${rId}"/>`);
        presText = presText.replace(sldRe, "");
      }

      const ctRe = new RegExp(`<Override PartName="/ppt/slides/slide${n}\\.xml"[^>]*/>`);
      ctText = ctText.replace(ctRe, "");

      if (zip.file(slidePath)) zip.remove(slidePath);
      if (zip.file(relsPath)) zip.remove(relsPath);
    }
  }

  zip.file("ppt/_rels/presentation.xml.rels", presRelsText);
  zip.file("ppt/presentation.xml", presText);
  zip.file("[Content_Types].xml", ctText);
}

function buildBlobFromTemplate(
  templateBuf: ArrayBuffer,
  shared: SharedFields,
  colaboradores: Colaborador[],
): Blob {
  const zip = new PizZip(templateBuf);

  const newBody = xmlEscape(buildBody(shared));
  const escapedInstrutor = xmlEscape(shared.instrutorNome);
  const escapedCargo = xmlEscape(` ${shared.instrutorCargo}`);

  for (let i = 0; i < colaboradores.length; i++) {
    const slot = SLOTS[i];
    const file = zip.file(slot.slideFile);
    if (!file) continue;
    let xml = file.asText();

    xml = replaceAll(xml, xmlEscape(ORIGINAL_BODY), newBody);
    // Rede de segurança: garante que o parágrafo do corpo (que começa com
    // "Participou e concluiu") sempre reflita os campos atuais de `shared`,
    // mesmo se o texto do template tiver variado (espaços, caractere
    // invisível, edição prévia). Sem isso, uma pequena divergência entre
    // ORIGINAL_BODY e o XML deixaria a data/treinamento antigos no arquivo.
    xml = xml.replace(
      /<a:t>(\s*)Participou e concluiu[\s\S]*?<\/a:t>/g,
      (_m, lead) => `<a:t>${lead}${newBody}</a:t>`,
    );
    xml = replaceAll(xml, xmlEscape(ORIGINAL_INSTRUTOR), escapedInstrutor);
    xml = replaceAll(xml, xmlEscape(ORIGINAL_INSTRUTOR_CARGO), escapedCargo);
    xml = replaceAll(xml, xmlEscape(slot.regLine), xmlEscape(`Reg: ${shared.instrutorRegistro} `));

    const col = colaboradores[i];
    const nomeOriginalUpper = slot.nomeUpper.trim();
    const nomeUpperPrefix = slot.nomeUpper.slice(
      0,
      slot.nomeUpper.length - nomeOriginalUpper.length,
    );

    const nomeUpper = col.nome.trim().toUpperCase();
    const nomeSig = titleCase(col.nome.trim());
    xml = replaceAll(xml, xmlEscape(slot.nomeUpper), xmlEscape(nomeUpperPrefix + nomeUpper));
    xml = stabilizeSignatureNameBodies(xml, [shared.instrutorNome, nomeSig]);
    xml = replaceAll(xml, xmlEscape(slot.nomeSignature), xmlEscape(nomeSig));
    xml = replaceAll(xml, xmlEscape(`CPF:  ${slot.cpf}`), xmlEscape(`CPF:  ${col.cpf || ""}`));

    zip.file(slot.slideFile, fitNoWrapBodies(xml));

    // Verso do certificado: reescreve o Conteúdo Programático
    const backNum = 2 * (i + 1);
    const backPath = `ppt/slides/slide${backNum}.xml`;
    const backFile = zip.file(backPath);
    if (backFile) {
      const backXml = applyConteudoProgramatico(backFile.asText(), shared.conteudoProgramatico);
      zip.file(backPath, backXml);
    }
  }

  removeUnusedSlots(zip, colaboradores.length);
  standardizeCertificateSlides(zip);

  return zip.generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    compression: "DEFLATE",
  });
}

export interface GenerateOptions {
  /** Se verdadeiro, mescla todos os chunks num único PPTX (via generateBatchPptx interno). */
  singlePptx?: boolean;
  /** Se verdadeiro, gera um PPTX por colaborador nomeado "<curso>-<nome>.pptx" (entregue em ZIP). */
  perPerson?: boolean;
  /** Callback opcional para exibir progresso: (feitos, total). */
  onProgress?: (done: number, total: number) => void;
  /** Cancelamento cooperativo. */
  signal?: AbortSignal;
}

export async function generatePptx(
  shared: SharedFields,
  colaboradores: Colaborador[],
  fileName = "certificados-volga.pptx",
  opts: GenerateOptions = {},
): Promise<{ chunks: number; format: "pptx" | "zip" }> {
  const cols = onlyIncluded(colaboradores).slice(0, MAX_COLABORADORES);
  if (cols.length === 0) {
    throw new Error("Nenhum colaborador preenchido para gerar");
  }

  if (isOriginalTemplate(shared)) {
    return generateOriginalPptx(shared, cols, fileName, opts);
  }

  // Modo "um arquivo por pessoa": ZIP com um PPTX por colaborador (curso-nome.pptx).
  if (opts.perPerson) {
    const tbuf = await fetchTemplateBuffer(TEMPLATE_URL, "o template");
    const zipOut = new PizZip();
    const courseSlug = safeFileName(shared.treinamento || "certificado");
    const used = new Map<string, number>();
    opts.onProgress?.(0, cols.length);
    for (let i = 0; i < cols.length; i++) {
      throwIfAborted(opts.signal);
      const blob = buildBlobFromTemplate(tbuf.slice(0), shared, [cols[i]]);
      const personSlug = safeFileName(cols[i].nome) || `colaborador-${i + 1}`;
      let name = `${courseSlug}-${personSlug}.pptx`;
      const key = name.toLowerCase();
      const n = (used.get(key) ?? 0) + 1;
      used.set(key, n);
      if (n > 1) name = `${courseSlug}-${personSlug}-${n}.pptx`;
      zipOut.file(name, await blob.arrayBuffer());
      opts.onProgress?.(i + 1, cols.length);
      await new Promise((r) => setTimeout(r, 0));
    }
    saveAs(
      zipOut.generate({ type: "blob", mimeType: "application/zip", compression: "DEFLATE" }),
      `${courseSlug}-por-pessoa.zip`,
    );
    return { chunks: cols.length, format: "zip" };
  }

  // Modo "único PPTX": reaproveita a mesclagem do lote com uma única entrada.
  if (opts.singlePptx && cols.length > CHUNK_SIZE) {
    const r = await generateBatchPptx(
      [{ shared, cols }],
      fileName.endsWith(".pptx") ? fileName : `${fileName}.pptx`,
      { signal: opts.signal, onProgress: opts.onProgress },
    );
    return { chunks: r.units, format: "pptx" };
  }

  const templateBuf = await fetchTemplateBuffer(TEMPLATE_URL, "o template");

  const chunks: Colaborador[][] = [];
  for (let i = 0; i < cols.length; i += CHUNK_SIZE) {
    chunks.push(cols.slice(i, i + CHUNK_SIZE));
  }

  const base = fileName.replace(/\.pptx$/i, "");

  if (chunks.length === 1) {
    const blob = buildBlobFromTemplate(templateBuf, shared, chunks[0]);
    saveAs(blob, `${base}.pptx`);
    opts.onProgress?.(1, 1);
    return { chunks: 1, format: "pptx" };
  }

  const zip = new PizZip();
  let done = 0;
  const total = chunks.length;
  opts.onProgress?.(0, total);
  const pad = String(total).length;
  for (let i = 0; i < chunks.length; i++) {
    throwIfAborted(opts.signal);
    const buf = templateBuf.slice(0);
    const blob = buildBlobFromTemplate(buf, shared, chunks[i]);
    const ab = await blob.arrayBuffer();
    const from = String(i * CHUNK_SIZE + 1).padStart(pad, "0");
    const to = String(i * CHUNK_SIZE + chunks[i].length).padStart(pad, "0");
    zip.file(`${base}-parte${String(i + 1).padStart(pad, "0")}-cols${from}-${to}.pptx`, ab);
    done += 1;
    opts.onProgress?.(done, total);
    // devolve o event loop para atualizar UI entre chunks
    await new Promise((r) => setTimeout(r, 0));
  }
  const out = zip.generate({
    type: "blob",
    mimeType: "application/zip",
    compression: "DEFLATE",
  });
  saveAs(out, `${base}.zip`);
  return { chunks: chunks.length, format: "zip" };
}

// ============================================================
// LOTE: mescla vários treinamentos em um único PPTX
// ============================================================

export interface BatchEntry {
  shared: SharedFields;
  cols: Colaborador[];
  name?: string;
}

export interface BatchFailure {
  name: string;
  error: string;
}

export interface BatchOptions {
  /** Progresso por unidade gerada: (feitas, total estimado). */
  onProgress?: (done: number, total: number) => void;
  onCurrent?: (model: string, person: string, block: number) => void;
  /** Cancelamento cooperativo. */
  signal?: AbortSignal;
}

export class GenerationAbortedError extends Error {
  constructor() {
    super("Geração cancelada");
    this.name = "GenerationAbortedError";
  }
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new GenerationAbortedError();
}

function fillSlideXml(
  origXml: string,
  slideNumInUnit: number,
  shared: SharedFields,
  cols: Colaborador[],
): string {
  let xml = origXml;
  const newBody = xmlEscape(buildBody(shared));
  xml = replaceAll(xml, xmlEscape(ORIGINAL_BODY), newBody);
  xml = xml.replace(
    /<a:t>(\s*)Participou e concluiu[\s\S]*?<\/a:t>/g,
    (_m, lead) => `<a:t>${lead}${newBody}</a:t>`,
  );
  xml = replaceAll(xml, xmlEscape(ORIGINAL_INSTRUTOR), xmlEscape(shared.instrutorNome));
  xml = replaceAll(
    xml,
    xmlEscape(ORIGINAL_INSTRUTOR_CARGO),
    xmlEscape(` ${shared.instrutorCargo}`),
  );

  if (slideNumInUnit % 2 === 1) {
    const slotIdx = (slideNumInUnit - 1) / 2;
    const slot = SLOTS[slotIdx];
    const col = cols[slotIdx];
    if (slot && col && col.nome.trim()) {
      xml = replaceAll(
        xml,
        xmlEscape(slot.regLine),
        xmlEscape(`Reg: ${shared.instrutorRegistro} `),
      );
      const nomeOriginalUpper = slot.nomeUpper.trim();
      const nomeUpperPrefix = slot.nomeUpper.slice(
        0,
        slot.nomeUpper.length - nomeOriginalUpper.length,
      );
      const nomeUpper = col.nome.trim().toUpperCase();
      const nomeSig = titleCase(col.nome.trim());
      xml = replaceAll(xml, xmlEscape(slot.nomeUpper), xmlEscape(nomeUpperPrefix + nomeUpper));
      xml = replaceAll(xml, xmlEscape(slot.nomeSignature), xmlEscape(nomeSig));
      xml = stabilizeSignatureNameBodies(xml, [shared.instrutorNome, nomeSig]);
      xml = replaceAll(xml, xmlEscape(`CPF:  ${slot.cpf}`), xmlEscape(`CPF:  ${col.cpf || ""}`));
    }
  } else {
    // Verso: reescreve o Conteúdo Programático conforme o modelo
    xml = applyConteudoProgramatico(xml, shared.conteudoProgramatico);
  }
  return xml;
}

export async function generateBatchPptx(
  entries: BatchEntry[],
  fileName = "certificados-volga-lote.pptx",
  opts: BatchOptions = {},
): Promise<{ units: number; entries: number; failed: BatchFailure[] }> {
  if (!entries.length) throw new Error("Selecione ao menos um modelo");
  if (entries.some((entry) => isOriginalTemplate(entry.shared))) {
    return generateOriginalBatchArchive(entries, fileName, opts);
  }

  const templateBuf = await fetchTemplateBuffer(TEMPLATE_URL, "o template");
  const zip = new PizZip(templateBuf);

  // Guarda originais dos slides antes de sobrescrever
  const origXml: string[] = [];
  const origRels: string[] = [];
  for (let n = 1; n <= ORIG_SLIDE_COUNT; n++) {
    const f = zip.file(`ppt/slides/slide${n}.xml`);
    const r = zip.file(`ppt/slides/_rels/slide${n}.xml.rels`);
    if (!f || !r) throw new Error(`Template inválido (slide${n}).`);
    origXml.push(f.asText());
    origRels.push(r.asText());
  }

  // Expande cada entrada em "unidades" de até 5 colaboradores (1 unidade = até 10 slides do template)
  type Unit = { shared: SharedFields; cols: Colaborador[]; label: string };
  const units: Unit[] = [];
  for (const e of entries) {
    const cs = onlyIncluded(e.cols).slice(0, MAX_COLABORADORES);
    if (cs.length === 0) continue;
    for (let i = 0; i < cs.length; i += CHUNK_SIZE) {
      units.push({
        shared: e.shared,
        cols: cs.slice(i, i + CHUNK_SIZE),
        label: e.name || e.shared.treinamento || "Modelo",
      });
    }
  }
  if (units.length === 0) throw new Error("Nenhum colaborador preenchido");

  // Primeira unidade sobrescreve slide1..slideN in-place e remove os slots sobrando
  const u0 = units[0];
  throwIfAborted(opts.signal);
  opts.onCurrent?.(u0.label, u0.cols[0]?.nome || "Colaborador sem nome", 1);
  for (let n = 1; n <= 2 * u0.cols.length; n++) {
    zip.file(`ppt/slides/slide${n}.xml`, fillSlideXml(origXml[n - 1], n, u0.shared, u0.cols));
  }
  removeUnusedSlots(zip, u0.cols.length);

  // Unidades adicionais viram novos slide parts (só os pares realmente usados)
  const presRelsFile = zip.file("ppt/_rels/presentation.xml.rels");
  const presFile = zip.file("ppt/presentation.xml");
  const ctFile = zip.file("[Content_Types].xml");
  if (!presRelsFile || !presFile || !ctFile) throw new Error("Template inválido (manifests).");

  const presRelsText = presRelsFile.asText();
  const presText = presFile.asText();
  const ctText = ctFile.asText();

  let maxRid = 0;
  const rIdRe = /Id="rId(\d+)"/g;
  let m: RegExpExecArray | null;
  while ((m = rIdRe.exec(presRelsText))) {
    const v = parseInt(m[1], 10);
    if (v > maxRid) maxRid = v;
  }
  let maxSldId = 255;
  const sldIdRe = /<p:sldId id="(\d+)"/g;
  while ((m = sldIdRe.exec(presText))) {
    const v = parseInt(m[1], 10);
    if (v > maxSldId) maxSldId = v;
  }

  const relsInserts: string[] = [];
  const sldIdInserts: string[] = [];
  const overrideInserts: string[] = [];
  let nextSlideNum = ORIG_SLIDE_COUNT + 1;

  opts.onProgress?.(1, units.length);
  for (let ui = 1; ui < units.length; ui++) {
    throwIfAborted(opts.signal);
    const u = units[ui];
    opts.onCurrent?.(u.label, u.cols[0]?.nome || "Colaborador sem nome", ui + 1);

    // só emite os pares (frente+verso) dos colaboradores realmente preenchidos
    for (let n = 1; n <= 2 * u.cols.length; n++) {
      const newN = nextSlideNum++;
      zip.file(`ppt/slides/slide${newN}.xml`, fillSlideXml(origXml[n - 1], n, u.shared, u.cols));
      zip.file(`ppt/slides/_rels/slide${newN}.xml.rels`, origRels[n - 1]);

      maxRid += 1;
      maxSldId += 1;
      relsInserts.push(
        `<Relationship Id="rId${maxRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${newN}.xml"/>`,
      );
      sldIdInserts.push(`<p:sldId id="${maxSldId}" r:id="rId${maxRid}"/>`);
      overrideInserts.push(
        `<Override PartName="/ppt/slides/slide${newN}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
      );
    }
    opts.onProgress?.(ui + 1, units.length);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  if (relsInserts.length) {
    zip.file(
      "ppt/_rels/presentation.xml.rels",
      presRelsText.replace("</Relationships>", relsInserts.join("") + "</Relationships>"),
    );
    zip.file(
      "ppt/presentation.xml",
      presText.replace("</p:sldIdLst>", sldIdInserts.join("") + "</p:sldIdLst>"),
    );
    zip.file(
      "[Content_Types].xml",
      ctText.replace("</Types>", overrideInserts.join("") + "</Types>"),
    );
  }

  throwIfAborted(opts.signal);
  standardizeCertificateSlides(zip);
  const blob = zip.generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    compression: "DEFLATE",
  });
  const base = fileName.replace(/\.pptx$/i, "");
  saveAs(blob, `${base}.pptx`);
  return { units: units.length, entries: entries.length, failed: [] };
}
