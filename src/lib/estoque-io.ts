import Papa from "papaparse";
import type { WorkBook } from "xlsx";
import { loadXlsx } from "./xlsx-lazy";
import type { EstoqueItem } from "./estoque-store";

const COD_BARRAS_KEYS = ["codbarras", "codigodebarras", "codigobarras"];

function normalizarChave(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s\u00a0_]/g, "");
}

function hasField(row: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(row).some((key) => keys.includes(normalizarChave(key)));
}

function pickField(row: Record<string, unknown>, keys: string[]): string {
  for (const k of Object.keys(row)) {
    const norm = normalizarChave(k);
    if (keys.includes(norm)) {
      const v = row[k];
      return v == null ? "" : String(v).trim();
    }
  }
  return "";
}

export function parseEstoqueInt(raw: string): number | null {
  const cleaned = raw.replace(/["\s]/g, "");
  if (!cleaned) return null;
  const inteiro = /^\d+$/.test(cleaned)
    ? cleaned
    : /^\d{1,3}(?:\.\d{3})+$/.test(cleaned)
      ? cleaned.replace(/\./g, "")
      : "";
  const n = Number(inteiro);
  return inteiro && Number.isSafeInteger(n) && n >= 0 ? n : null;
}

export function parsePrecoBr(raw: string): number | null {
  const cleaned = raw
    .trim()
    .replace(/^R\$\s*/i, "")
    .replace(/["\s]/g, "");
  if (!cleaned) return null;
  const brGrouped = /^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(cleaned);
  const brPlain = /^\d+(?:,\d{1,2})?$/.test(cleaned);
  const dotDecimal = /^\d+\.\d{1,2}$/.test(cleaned);
  if (!brGrouped && !brPlain && !dotDecimal) return null;
  const normalized = brGrouped || brPlain ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export interface ImportResultado {
  itens: EstoqueItem[];
  warnings: string[];
  linhasLidas: number;
  linhasValidas: number;
}

/**
 * Lê o relatório de catálogo exportado do BuscaEPI (colunas: TIPO, COD, ITEM,
 * CA, VALIDADE_CA, SKU, COR, TAMANHO, ESTOQUE_GERAL, ULT_PRECO, COD_BARRAS).
 * Esse arquivo vem em UTF-16 (às vezes com BOM) separado por ";" — por isso é
 * lido como ArrayBuffer e decodificado explicitamente, nunca com `file.text()`
 * (que embaralharia acentos e números).
 */
export async function parseEstoqueCatalogoFile(file: File): Promise<ImportResultado> {
  if (!/\.(csv|txt|xlsx|xls)$/i.test(file.name)) {
    throw new Error(
      "Formato não suportado. Importe o catálogo do BuscaEPI em CSV/TXT ou uma planilha XLSX/XLS com as mesmas colunas.",
    );
  }

  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (bytes.length === 0) throw new Error("O arquivo está vazio.");

  let rows: Record<string, unknown>[];
  if (/\.(xlsx|xls)$/i.test(file.name)) {
    const XLSX = await loadXlsx();
    const workbook = XLSX.read(buf, { type: "array", cellDates: false });
    if (!workbook.SheetNames.length) throw new Error("A planilha não possui abas para importar.");
    // Usa a primeira aba que tenha coluna de código de barras (ex.: aba "Catálogo" da planilha de contagem).
    rows = [];
    for (const name of workbook.SheetNames) {
      const r = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[name], {
        defval: "",
        raw: false,
      });
      if (r.some((row) => pickField(row, COD_BARRAS_KEYS))) {
        rows = r;
        break;
      }
    }
  } else {
    let text: string;
    if (bytes[0] === 0xff && bytes[1] === 0xfe)
      text = new TextDecoder("utf-16le").decode(bytes.slice(2));
    else if (bytes[0] === 0xfe && bytes[1] === 0xff)
      text = new TextDecoder("utf-16be").decode(bytes.slice(2));
    else {
      text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      if (text.includes("\u0000") || text.includes("\uFFFD"))
        text = new TextDecoder("utf-16le").decode(bytes);
    }
    const res = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      delimiter: ";",
      skipEmptyLines: true,
    });
    const criticos = res.errors?.filter((e) => e.type !== "FieldMismatch") ?? [];
    if (criticos.length)
      throw new Error(
        `Não foi possível interpretar o CSV (linha ${criticos[0].row ?? "?"}): ${criticos[0].message}`,
      );
    rows = res.data;
  }

  if (rows.length && !hasField(rows[0], ["estoquegeral", "estoquesistema"])) {
    throw new Error(
      'Coluna de estoque não encontrada. Inclua "ESTOQUE_GERAL" ou "ESTOQUE_SISTEMA" no catálogo.',
    );
  }

  const warnings: string[] = [];
  const itens: EstoqueItem[] = [];
  const now = Date.now();
  const vistos = new Set<string>();
  let linhasLidas = 0;

  for (const [index, row] of rows.entries()) {
    linhasLidas += 1;
    const codBarras = pickField(row, COD_BARRAS_KEYS).replace(/\.0+$/, "");
    const sku = pickField(row, ["sku"]);
    const tipo = pickField(row, ["tipo"]);
    const item = pickField(row, ["item"]);
    const cor = pickField(row, ["cor"]);
    const tamanho = pickField(row, ["tamanho"]);
    const estoqueRaw = pickField(row, ["estoquegeral", "estoquesistema"]);
    const precoRaw = pickField(row, ["ultpreco", "ultimopreco"]);

    if (!codBarras && !sku && !item) continue; // linha em branco / rodapé com total de linhas

    if (!codBarras) {
      warnings.push(`SKU "${sku || "(sem SKU)"}" ignorado: não tem código de barras.`);
      continue;
    }
    if (!sku) {
      warnings.push(`Código de barras "${codBarras}" ignorado: não tem SKU.`);
      continue;
    }
    const estoqueSistema = parseEstoqueInt(estoqueRaw);
    if (estoqueSistema === null) {
      warnings.push(`Linha ${index + 2} ignorada: quantidade de estoque ausente ou inválida.`);
      continue;
    }
    if (vistos.has(codBarras)) {
      warnings.push(
        `Código de barras duplicado no arquivo: "${codBarras}" — mantida a primeira ocorrência.`,
      );
      continue;
    }
    vistos.add(codBarras);

    const preco = parsePrecoBr(precoRaw);
    if (precoRaw.trim() && preco === null) {
      warnings.push(
        `Linha ${index + 2}: preço inválido; o impacto financeiro ficará sem valor para este item.`,
      );
    }

    itens.push({
      codBarras,
      sku,
      tipo,
      item: item || "(sem descrição)",
      cor,
      tamanho,
      estoqueSistema,
      preco,
      updatedAt: now,
    });
  }

  if (itens.length === 0) {
    throw new Error(
      "Nenhum item válido encontrado. Confira se o arquivo é o relatório de catálogo exportado do BuscaEPI (colunas TIPO, COD, ITEM, SKU, COD_BARRAS…).",
    );
  }

  return { itens, warnings, linhasLidas, linhasValidas: itens.length };
}

export interface LinhaContagem {
  item: EstoqueItem;
  contado: number;
  conferido: boolean;
}

function nomeArquivoComData(prefixo: string, extensao: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const carimbo = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `${prefixo}_${carimbo}.${extensao}`;
}

/**
 * Gera o workbook final da contagem, com TRÊS abas:
 *  1) "Resumo" — números gerais da contagem, para quem for revisar antes de importar.
 *  2) "Ajuste BuscaEPI" — só os itens divergentes, no layout oficial exigido pelo
 *     importador (SKU, Qtde*, Preço Unitário, Observações), pronto para colar/importar.
 *  3) "Contagem completa" — todos os itens, para auditoria (o que foi e não foi contado).
 *
 * Qtde* é a DIFERENÇA (contado − sistema), que é a regra que o próprio BuscaEPI
 * usa para lançar ajuste de estoque (soma/subtrai do estoque atual).
 */
export async function gerarWorkbookContagem(linhas: LinhaContagem[]): Promise<{
  workbook: WorkBook;
  nomeArquivo: string;
}> {
  const XLSX = await loadXlsx();
  const divergentes = linhas.filter((l) => l.conferido && l.contado - l.item.estoqueSistema !== 0);
  const semLeitura = linhas.filter((l) => !l.conferido);

  // --- Aba 1: Resumo ---
  const agora = new Date();
  const resumoLinhas: (string | number)[][] = [
    ["Contagem de Estoque — BuscaEPI", ""],
    ["Gerado em", agora.toLocaleString("pt-BR")],
    ["Itens no catálogo", linhas.length],
    ["Itens com divergência", divergentes.length],
    ["Itens pendentes de conferência", semLeitura.length],
    [
      "Itens conferidos (contagem = sistema)",
      linhas.length - divergentes.length - semLeitura.length,
    ],
    [
      "Atenção",
      "Itens pendentes não entram na aba de ajuste. Conclua a conferência antes de importar.",
    ],
    [""],
    ["Como usar este arquivo", ""],
    [
      'A aba "Ajuste BuscaEPI" já está pronta para importar — Qtde* é o ajuste (diferença) apurado.',
      "",
    ],
    ['A aba "Contagem completa" é só para conferência, não precisa importar essa aba.', ""],
  ];
  const resumoSheet = XLSX.utils.aoa_to_sheet(resumoLinhas);
  resumoSheet["!cols"] = [{ wch: 46 }, { wch: 22 }];
  resumoSheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];

  // --- Aba 2: Ajuste BuscaEPI (layout oficial) ---
  const ajusteHeader = ["SKU", "Qtde*", "Preço Unitário", "Observações"];
  const ajusteRows = divergentes.map((l) => {
    const diff = l.contado - l.item.estoqueSistema;
    return [
      l.item.sku,
      diff,
      l.item.preco ?? "",
      `Ajuste de contagem — ${l.item.item} (${agora.toLocaleDateString("pt-BR")})`,
    ];
  });
  const ajusteSheet = XLSX.utils.aoa_to_sheet([ajusteHeader, ...ajusteRows]);
  ajusteSheet["!cols"] = [{ wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 55 }];
  ajusteSheet["!autofilter"] = { ref: `A1:D${ajusteRows.length + 1}` };
  for (let r = 0; r < ajusteRows.length; r++) {
    const precoCell = ajusteSheet[XLSX.utils.encode_cell({ r: r + 1, c: 2 })];
    if (precoCell && typeof precoCell.v === "number") precoCell.z = '"R$" #,##0.00';
  }

  // --- Aba 3: Contagem completa (auditoria) ---
  const completaHeader = [
    "Código de Barras",
    "SKU",
    "Item",
    "Cor",
    "Tamanho",
    "Estoque Sistema",
    "Qtd. Contada",
    "Diferença",
    "Situação",
  ];
  const completaRows = linhas.map((l) => [
    l.item.codBarras,
    l.item.sku,
    l.item.item,
    l.item.cor,
    l.item.tamanho,
    l.item.estoqueSistema,
    l.conferido ? l.contado : "",
    l.conferido ? l.contado - l.item.estoqueSistema : "",
    l.conferido ? (l.contado === l.item.estoqueSistema ? "Conferido" : "Divergente") : "Pendente",
  ]);
  const completaSheet = XLSX.utils.aoa_to_sheet([completaHeader, ...completaRows]);
  completaSheet["!cols"] = [
    { wch: 16 },
    { wch: 16 },
    { wch: 44 },
    { wch: 16 },
    { wch: 10 },
    { wch: 14 },
    { wch: 12 },
    { wch: 10 },
    { wch: 15 },
  ];
  completaSheet["!autofilter"] = { ref: `A1:I${completaRows.length + 1}` };
  completaSheet["!freeze"] = { xSplit: 0, ySplit: 1 };

  const workbook = XLSX.utils.book_new();
  workbook.Props = {
    Title: "Contagem de Estoque — BuscaEPI",
    Author: "Volga Engenharia",
    CreatedDate: agora,
  };
  XLSX.utils.book_append_sheet(workbook, resumoSheet, "Resumo");
  XLSX.utils.book_append_sheet(workbook, ajusteSheet, "Ajuste BuscaEPI");
  XLSX.utils.book_append_sheet(workbook, completaSheet, "Contagem completa");

  return { workbook, nomeArquivo: nomeArquivoComData("contagem-estoque-buscaepi", "xlsx") };
}
