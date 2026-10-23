import FileSaver from "file-saver";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { safeFlatten } from "./pdf-safe-flatten";
import { repairAcroForm } from "./pdf-repair-acroform";
// Arquivo servido de public/templates (funciona na Lovable e na Vercel).
const TEMPLATE_URL = "/templates/carta-anuencia-modelo.pdf";
import type { Colaborador } from "./certificate-template";
import { safeFileName } from "./generate-pptx";
import { fetchTemplateBuffer } from "./template-fetch";

const { saveAs } = FileSaver;

// Tipo mantido por compatibilidade com a UI existente.
export type AnuenciaNr = "nr10" | "nr12" | "nr33" | "nr35";

export interface AnuenciaSelection {
  cpf: string;
  nome: string;
  /** Caixas a marcar nesta carta (sobrepõe a seleção global). */
  nrs?: Partial<Record<AnuenciaNr, boolean>>;
}

export interface AnuenciaOptions {
  cidade?: string;
  /**
   * Data que aparece na carta ("Aparecida de Goiânia, {dia} de {mês} de {ano}").
   * Aceita Date ou string no formato yyyy-MM-dd. Quando omitida, usa a data
   * de hoje — o modelo original tinha uma data fixa (02/Janeiro/2026) que
   * nunca era atualizada.
   */
  data?: Date | string;
  /** Caixas a marcar em todas as cartas. */
  nrs?: Partial<Record<AnuenciaNr, boolean>>;
}

// Campos de formulário existentes no modelo original (AcroForm).
const FIELD_NOME = "Nome completo0";
const FIELD_CPF = "CPF0";
const FIELD_CIDADE = "Cidade";
const FIELD_DIA = "Dia";
const FIELD_MES = "Mês";
const FIELD_ANO = "Ano";

const MESES_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function parseAnuenciaData(data: Date | string | undefined): Date {
  if (!data) return new Date();
  if (data instanceof Date) return data;
  // yyyy-MM-dd — evita problema de fuso horário do `new Date(string)`.
  const m = data.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const parsed = new Date(data);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

/**
 * Campos do modelo original. Os nomes internos não seguem a ordem visual:
 * "Caixa de Seleção1" é a primeira linha (NR-10) e "Caixa de Seleção0" é
 * a segunda (NR-12).
 */
const CHECKBOX_FIELDS: Record<AnuenciaNr, string> = {
  nr10: "Caixa de Seleção1",
  nr12: "Caixa de Seleção0",
  nr33: "Caixa de Seleção2",
  nr35: "Caixa de Seleção3",
};

export const ANUENCIA_NR_LABELS: Record<AnuenciaNr, string> = {
  nr10: "NR-10 — Intervenções em Sistema Elétrico de Potência",
  nr12: "NR-12 — Atividades com máquinas e equipamentos",
  nr33: "NR-33 — Atividades em Espaço Confinado",
  nr35: "NR-35 — Atividades em Altura",
};

async function loadTemplateBytes(): Promise<ArrayBuffer> {
  try {
    return await fetchTemplateBuffer(
      "/templates/carta-anuencia-modelo.pdf",
      "o modelo local da carta de anuência",
    );
  } catch {
    return fetchTemplateBuffer(TEMPLATE_URL, "o modelo da carta de anuência");
  }
}

function trySetField(form: import("pdf-lib").PDFForm, name: string, value: string, size?: number) {
  try {
    const field = form.getTextField(name);
    field.setText(value);
    if (size) field.setFontSize(size);
  } catch {
    // campo ausente no modelo — ignora
  }
}

export async function generateAnuenciaPdf(
  entries: AnuenciaSelection[],
  opts: AnuenciaOptions = {},
  fileName = "cartas-de-anuencia.pdf",
): Promise<{ count: number }> {
  if (!entries.length) throw new Error("Nenhum colaborador selecionado");

  const templateBytes = await loadTemplateBytes();
  const outPdf = await PDFDocument.create();
  let count = 0;

  const dataCarta = parseAnuenciaData(opts.data);
  const dia = String(dataCarta.getDate()).padStart(2, "0");
  const mes = MESES_PT[dataCarta.getMonth()];
  const ano = String(dataCarta.getFullYear());

  for (const entry of entries) {
    const nome = entry.nome.trim().toUpperCase();
    const cpf = entry.cpf.trim();
    if (!nome) continue;

    // Uma cópia limpa do modelo por colaborador.
    const src = await PDFDocument.load(templateBytes);
    repairAcroForm(src);
    const font = await src.embedFont(StandardFonts.Helvetica);
    const form = src.getForm();

    // Preenche os campos do próprio formulário — sem cobrir nada.
    trySetField(form, FIELD_NOME, nome, 9);
    if (cpf) trySetField(form, FIELD_CPF, cpf, 9);
    if (opts.cidade) trySetField(form, FIELD_CIDADE, opts.cidade);
    trySetField(form, FIELD_DIA, dia);
    trySetField(form, FIELD_MES, mes);
    trySetField(form, FIELD_ANO, ano);

    // Marca/desmarca as caixas das NRs escolhidas.
    const nrs = { ...(opts.nrs ?? {}), ...(entry.nrs ?? {}) };
    for (const key of Object.keys(CHECKBOX_FIELDS) as AnuenciaNr[]) {
      try {
        const box = form.getCheckBox(CHECKBOX_FIELDS[key]);
        if (nrs[key]) box.check();
        else box.uncheck();
      } catch {
        // caixa ausente no modelo — ignora
      }
    }

    // Regera as aparências com a fonte embutida e "achata" o formulário,
    // preservando o layout original do modelo.
    safeFlatten(form, font);

    const flattened = await PDFDocument.load(await src.save());
    const [page] = await outPdf.copyPages(flattened, [0]);
    outPdf.addPage(page);
    count += 1;
  }

  if (!count) throw new Error("Nenhum colaborador válido para gerar");

  const bytes = await outPdf.save();
  const blob = new Blob([bytes as unknown as ArrayBuffer], { type: "application/pdf" });
  saveAs(blob, safeFileName(fileName.replace(/\.pdf$/i, "")) + ".pdf");
  return { count };
}

/** Compat: nome antigo continua exportado, agora produz PDF. */
export const generateAnuenciaDocx = generateAnuenciaPdf;

export function anuenciaFromColaboradores(
  cols: Colaborador[],
  _selections?: Record<number, Partial<Record<AnuenciaNr, boolean>>>,
): AnuenciaSelection[] {
  return cols
    .map((c) => ({
      cpf: c.cpf.trim(),
      nome: c.nome.trim(),
    }))
    .filter((e) => e.nome);
}
