import FileSaver from "file-saver";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { safeFlatten } from "./pdf-safe-flatten";
import { repairAcroForm } from "./pdf-repair-acroform";
// Arquivo servido de public/templates (funciona na Lovable e na Vercel).
const TEMPLATE_URL = "/templates/regras-de-ouro-modelo.pdf";
import type { Colaborador } from "./certificate-template";
import { safeFileName } from "./generate-pptx";
import { fetchTemplateBuffer } from "./template-fetch";

const { saveAs } = FileSaver;

import { regrasDeOuroFromColaboradores, type RegraDeOuroSelection } from "./certificados-dados";
export { regrasDeOuroFromColaboradores, type RegraDeOuroSelection };

export interface RegraDeOuroOptions {
  cidade?: string;
  /**
   * Data que aparece no termo ("{dia} de {mês} de {ano}").
   * Aceita Date ou string no formato yyyy-MM-dd. Quando omitida, usa a data
   * de hoje.
   */
  data?: Date | string;
}

// Campos de formulário existentes no modelo original (AcroForm).
const FIELD_NOME = "Nome Completo";
const FIELD_CPF = "CPF";
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

function parseRegraDeOuroData(data: Date | string | undefined): Date {
  if (!data) return new Date();
  if (data instanceof Date) return data;
  // yyyy-MM-dd — evita problema de fuso horário do `new Date(string)`.
  const m = data.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const parsed = new Date(data);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

async function loadTemplateBytes(): Promise<ArrayBuffer> {
  try {
    return await fetchTemplateBuffer(
      "/templates/regras-de-ouro-modelo.pdf",
      "o modelo local do Termo de Regras de Ouro",
    );
  } catch {
    return fetchTemplateBuffer(TEMPLATE_URL, "o modelo do Termo de Regras de Ouro");
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

export async function generateRegrasDeOuroPdf(
  entries: RegraDeOuroSelection[],
  opts: RegraDeOuroOptions = {},
  fileName = "termo-regras-de-ouro.pdf",
): Promise<{ count: number }> {
  if (!entries.length) throw new Error("Nenhum colaborador selecionado");

  const templateBytes = await loadTemplateBytes();
  const outPdf = await PDFDocument.create();
  let count = 0;

  const dataTermo = parseRegraDeOuroData(opts.data);
  const dia = String(dataTermo.getDate()).padStart(2, "0");
  const mes = MESES_PT[dataTermo.getMonth()];
  const ano = String(dataTermo.getFullYear());

  for (const entry of entries) {
    const nome = entry.nome.trim();
    const cpf = entry.cpf.trim();
    if (!nome) continue;

    // Uma cópia limpa do modelo por colaborador.
    const src = await PDFDocument.load(templateBytes);
    repairAcroForm(src);
    const font = await src.embedFont(StandardFonts.Helvetica);
    const form = src.getForm();

    trySetField(form, FIELD_NOME, nome, 10);
    if (cpf) trySetField(form, FIELD_CPF, cpf, 10);
    trySetField(form, FIELD_CIDADE, opts.cidade || "Ap. de Goiânia", 10);
    trySetField(form, FIELD_DIA, dia, 10);
    trySetField(form, FIELD_MES, mes, 10);
    trySetField(form, FIELD_ANO, ano, 10);

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
