/**
 * Regras de negócio do módulo de Armários — funções PURAS (sem React, sem
 * Supabase, sem DOM). Tudo que decide "isto é o mesmo armário?", "como se
 * escreve esta localização?" ou "o que a importação vai mudar?" mora aqui,
 * para poder ser testado isoladamente e reaproveitado pela tela e pela
 * importação sem duplicar lógica.
 */

export interface Locker {
  id: string;
  vestiario: string;
  localizacao: string;
  numero: string;
  ocupante: string;
  setor: string;
  situacao: string;
  updatedAt: number;
}

export type LockerFields = Omit<Locker, "id" | "updatedAt">;

export const LOCKER_FIELDS: Array<keyof LockerFields> = [
  "vestiario",
  "localizacao",
  "numero",
  "ocupante",
  "setor",
  "situacao",
];

export const FIELD_LABELS: Record<keyof LockerFields, string> = {
  vestiario: "Vestiário",
  localizacao: "Local",
  numero: "Número",
  ocupante: "Ocupante",
  setor: "Setor",
  situacao: "Situação",
};

export const VESTIARIOS_PADRAO = ["Masculino", "Feminino"] as const;
export const LOCALIZACOES_PADRAO = ["Vestiário", "Corredor Externo", "Corredor"] as const;
/** Situações operacionais padronizadas (vazio = sem pendência). */
export const SITUACOES_PADRAO = [
  "COLOCAR ETIQUETA",
  "COM LACRE",
  "EM MANUTENÇÃO",
  "BLOQUEADO",
] as const;

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

/** minúsculas, sem acento, sem espaços duplicados — para COMPARAR, nunca exibir. */
export function foldText(raw: string | null | undefined): string {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s\u00a0]+/g, " ")
    .trim()
    .toLowerCase();
}

function collapse(raw: string | null | undefined): string {
  return String(raw ?? "")
    .replace(/[\t\n\r\u00a0]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(raw: string): string {
  const minusculas = new Set(["de", "da", "do", "das", "dos", "e"]);
  return collapse(raw)
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && minusculas.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Normalização campo a campo
// ---------------------------------------------------------------------------

export function normalizeVestiario(raw: string): string {
  const v = foldText(raw);
  if (!v) return "";
  // "mac" cobre o typo real "Maculino" visto na planilha da Volga.
  if (v.startsWith("mas") || v.startsWith("mac")) return "Masculino";
  if (v.startsWith("fem")) return "Feminino";
  return titleCase(raw);
}

/**
 * A planilha e o seed antigo tinham 9 grafias para 3 locais ("Vestiario",
 * "vestiário", "(Vestiario", "CORREDOR EXTERNO"...). Cada grafia virava um
 * "local" diferente nos filtros e quebrava a reconciliação da importação.
 */
export function normalizeLocalizacao(raw: string): string {
  const limpo = collapse(String(raw ?? "").replace(/[()[\]{}]/g, " "));
  const v = foldText(limpo);
  if (!v) return "";
  if (v.startsWith("vest")) return "Vestiário";
  if (v.includes("corredor") && v.includes("extern")) return "Corredor Externo";
  if (v === "corredor") return "Corredor";
  return titleCase(limpo);
}

/** Números puramente numéricos ganham 3 dígitos ("97" → "097"), como no restante da base. */
export function normalizeNumero(raw: string): string {
  const v = collapse(raw).toUpperCase().replace(/\s+/g, "");
  if (/^\d+$/.test(v)) return v.length < 3 ? v.padStart(3, "0") : v;
  return v;
}

/** Ocupantes registrados como placeholder (armário sem pessoa fixa vinculada). */
const OCUPANTE_VAZIO = new Set(["vazio", "livre", "-", "teste global", "provisorio global"]);

export function normalizeOcupante(raw: string): string {
  const v = collapse(raw);
  if (OCUPANTE_VAZIO.has(foldText(v))) return "";
  return v.toUpperCase();
}

/** Grafias canônicas de setores com acento/erro de digitação recorrente. */
const SETOR_CANONICO: Record<string, string> = {
  producao: "PRODUÇÃO",
  poducao: "PRODUÇÃO",
  "producao adm": "PRODUÇÃO ADM",
  manutencao: "MANUTENÇÃO",
  "manutencao industrial": "MANUTENÇÃO INDUSTRIAL",
};

export function normalizeSetor(raw: string): string {
  const v = collapse(raw)
    .replace(/\s*-\s*/g, " - ")
    .replace(/^-\s*|\s*-$/g, "")
    .trim();
  if (!v) return "";
  return SETOR_CANONICO[foldText(v)] ?? v.toUpperCase();
}

export function normalizeSituacao(raw: string): string {
  const v = collapse(raw);
  if (!v) return "";
  const f = foldText(v);
  if (f.includes("etiqueta")) return "COLOCAR ETIQUETA";
  if (f.includes("lacre")) return "COM LACRE";
  if (f.includes("manutencao") || f.includes("conserto")) return "EM MANUTENÇÃO";
  if (f.includes("bloque")) return "BLOQUEADO";
  return v.toUpperCase();
}

/**
 * Na planilha real há situação escrita dentro do setor ("PRODUÇÃO - COLOCAR
 * ETIQUETA", "COM LACRE"). Separa as duas coisas para que filtros e
 * indicadores de pendência funcionem.
 */
/** Situação escrita explicitamente (sem ambiguidade com nome de setor como "MANUTENÇÃO"). */
function situacaoExplicita(raw: string): string | null {
  const f = foldText(raw);
  if (f.includes("etiqueta")) return "COLOCAR ETIQUETA";
  if (f === "com lacre" || f === "lacrado" || f === "lacre") return "COM LACRE";
  if (f === "bloqueado") return "BLOQUEADO";
  return null;
}

export function splitSetorSituacao(
  setorRaw: string,
  situacaoRaw: string,
): { setor: string; situacao: string } {
  let setor = normalizeSetor(setorRaw);
  let situacao = normalizeSituacao(situacaoRaw);
  if (setor) {
    const partes = setor.split(" - ");
    const sitDaParte = situacaoExplicita(partes[partes.length - 1]);
    if (sitDaParte) {
      situacao = situacao || sitDaParte;
      setor = normalizeSetor(partes.slice(0, -1).join(" - "));
    }
  }
  return { setor, situacao };
}

export function normalizeLocker<T extends LockerFields>(l: T): T {
  const { setor, situacao } = splitSetorSituacao(l.setor, l.situacao);
  return {
    ...l,
    vestiario: normalizeVestiario(l.vestiario) || "Masculino",
    localizacao: normalizeLocalizacao(l.localizacao),
    numero: normalizeNumero(l.numero),
    ocupante: normalizeOcupante(l.ocupante),
    setor,
    situacao,
  };
}

export function changedFields(
  antes: LockerFields,
  depois: LockerFields,
): Array<keyof LockerFields> {
  return LOCKER_FIELDS.filter((f) => (antes[f] ?? "") !== (depois[f] ?? ""));
}

// ---------------------------------------------------------------------------
// Identidade do armário físico
// ---------------------------------------------------------------------------

/** Mesmo armário físico = mesmo vestiário + local + número (sem acento, caixa ou zeros à esquerda). */
export function slotKey(l: Pick<Locker, "vestiario" | "localizacao" | "numero">): string {
  const numero = foldText(normalizeNumero(l.numero)).replace(/^0+(?=\d)/, "");
  return `${foldText(normalizeVestiario(l.vestiario) || "Masculino")}|${foldText(
    normalizeLocalizacao(l.localizacao),
  )}|${numero}`;
}

export function ocupanteKey(nome: string): string {
  return foldText(nome);
}

export function isOcupado(l: Locker): boolean {
  return l.ocupante.trim().length > 0;
}

export function hasPendencia(l: Locker): boolean {
  return l.situacao.trim().length > 0;
}

function hasDados(l: Locker): boolean {
  return isOcupado(l) || l.setor.trim().length > 0 || hasPendencia(l);
}

export function compareLockers(a: Locker, b: Locker): number {
  return (
    a.vestiario.localeCompare(b.vestiario, "pt-BR") ||
    a.localizacao.localeCompare(b.localizacao, "pt-BR") ||
    a.numero.localeCompare(b.numero, "pt-BR", { numeric: true })
  );
}

/** Entre registros do mesmo armário, prefere o que tem dados e o mais recente. */
function preferido(a: Locker, b: Locker): Locker {
  if (isOcupado(a) !== isOcupado(b)) return isOcupado(a) ? a : b;
  if (hasDados(a) !== hasDados(b)) return hasDados(a) ? a : b;
  return b.updatedAt > a.updatedAt ? b : a;
}

export function groupBy<T>(list: T[], key: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of list) {
    const k = key(item);
    if (!k) continue;
    const arr = map.get(k);
    if (arr) arr.push(item);
    else map.set(k, [item]);
  }
  return map;
}

/** Agrupa cópias que apontam para a mesma vaga física normalizada. */
export function groupByPhysicalSlot(list: Locker[]): Locker[][] {
  return Array.from(groupBy(list, slotKey).values());
}

// ---------------------------------------------------------------------------
// Busca, filtros e indicadores
// ---------------------------------------------------------------------------

export function matchesSearch(l: Locker, query: string): boolean {
  const tokens = foldText(query).split(" ").filter(Boolean);
  if (!tokens.length) return true;
  const numeroSemZero = l.numero.replace(/^0+(?=\d)/, "");
  const hay = foldText(
    [l.numero, numeroSemZero, l.ocupante, l.setor, l.localizacao, l.vestiario, l.situacao].join(
      " ",
    ),
  );
  return tokens.every((t) => {
    if (/^\d+$/.test(t)) {
      // "97" encontra o armário "097" e números que contenham 97, mas também texto
      const n = t.replace(/^0+(?=\d)/, "");
      return numeroSemZero === n || l.numero.includes(t) || hay.includes(t);
    }
    return hay.includes(t);
  });
}

export interface LockerStats {
  total: number;
  ocupados: number;
  livres: number;
  pendencias: number;
  ocupacaoPct: number;
}

export function computeStats(list: Locker[]): LockerStats {
  const slots = groupByPhysicalSlot(list);
  const ocupados = slots.filter((group) => group.some(isOcupado)).length;
  const total = slots.length;
  return {
    total,
    ocupados,
    livres: total - ocupados,
    pendencias: slots.filter((group) => group.some(hasPendencia)).length,
    ocupacaoPct: total ? Math.round((ocupados / total) * 100) : 0,
  };
}

// ---------------------------------------------------------------------------
// Inconsistências da base
// ---------------------------------------------------------------------------

export interface LockerInconsistencies {
  /** Mesmo armário físico cadastrado mais de uma vez. */
  slotsDuplicados: Locker[][];
  /** Mesmo colaborador ocupando mais de um armário. */
  ocupantesDuplicados: Locker[][];
  /** Ocupado, mas sem setor informado. */
  semSetor: Locker[];
  /** Setor preenchido com o próprio nome do colaborador (erro de digitação na planilha). */
  setorIgualNome: Locker[];
  /** Registros gravados fora do padrão (grafia, zeros, caixa). */
  foraDoPadrao: Locker[];
  total: number;
}

export function findInconsistencies(list: Locker[]): LockerInconsistencies {
  const slotsDuplicados = [...groupBy(list, slotKey).values()].filter((g) => g.length > 1);
  const ocupantesDuplicados = [
    ...groupBy(list.filter(isOcupado), (l) => ocupanteKey(l.ocupante)).values(),
  ].filter((g) => g.length > 1);
  const semSetor = list.filter((l) => isOcupado(l) && !l.setor.trim());
  const setorIgualNome = list.filter(
    (l) => isOcupado(l) && l.setor && foldText(l.setor) === foldText(l.ocupante),
  );
  const foraDoPadrao = list.filter((l) => changedFields(l, normalizeLocker(l)).length > 0);
  return {
    slotsDuplicados,
    ocupantesDuplicados,
    semSetor,
    setorIgualNome,
    foraDoPadrao,
    total:
      slotsDuplicados.length +
      ocupantesDuplicados.length +
      semSetor.length +
      setorIgualNome.length +
      foraDoPadrao.length,
  };
}

// ---------------------------------------------------------------------------
// Padronização da base existente
// ---------------------------------------------------------------------------

export interface StandardizationPlan {
  /** Registros que serão regravados com a grafia padrão. */
  atualizar: Array<{ antes: Locker; depois: Locker; campos: Array<keyof LockerFields> }>;
  /** Cópias VAZIAS de um armário que já tem outro registro — seguras para remover. */
  remover: Locker[];
  /** Duplicados com dados diferentes: precisam de decisão manual, não são tocados. */
  conflitos: Locker[][];
}

export function planStandardization(list: Locker[], now = Date.now()): StandardizationPlan {
  const atualizar: StandardizationPlan["atualizar"] = [];
  const remover: Locker[] = [];
  const conflitos: Locker[][] = [];

  for (const grupo of groupBy(list, slotKey).values()) {
    let manter: Locker;
    if (grupo.length === 1) {
      manter = grupo[0];
    } else {
      const comDados = grupo.filter(hasDados);
      if (comDados.length > 1) {
        conflitos.push(grupo);
        continue;
      }
      manter = grupo.reduce(preferido);
      remover.push(...grupo.filter((l) => l.id !== manter.id));
    }
    const depois = { ...normalizeLocker(manter), updatedAt: now };
    const campos = changedFields(manter, depois);
    if (campos.length) atualizar.push({ antes: manter, depois, campos });
  }
  return { atualizar, remover, conflitos };
}

// ---------------------------------------------------------------------------
// Importação de planilha
// ---------------------------------------------------------------------------

export interface ImportConflict {
  numero: string;
  localizacao: string;
  mantido: Locker;
  descartados: Locker[];
  motivo: string;
}

export interface ImportPlan {
  novos: Locker[];
  atualizados: Array<{ antes: Locker; depois: Locker; campos: Array<keyof LockerFields> }>;
  semAlteracao: number;
  /** Linhas do arquivo que apontam para o mesmo armário físico. */
  conflitosArquivo: ImportConflict[];
  /** Colaboradores que ficarão em mais de um armário após a importação. */
  ocupantesDuplicados: Array<{ nome: string; armarios: string[] }>;
}

function rotulo(l: Locker): string {
  return `${l.numero}${l.localizacao ? ` (${l.localizacao})` : ""}`;
}

/**
 * Compara o arquivo com a base SEM gravar nada:
 * 1. normaliza todas as linhas;
 * 2. resolve linhas repetidas do mesmo armário no arquivo (antes isso fazia o
 *    lote inteiro falhar na restrição única do banco);
 * 3. reaproveita o `id` do armário já existente (accent/caixa/zero-insensível);
 * 4. classifica em novos × atualizados × sem alteração.
 */
export function planImport(parsed: Locker[], existing: Locker[]): ImportPlan {
  const conflitosArquivo: ImportConflict[] = [];
  const unicos: Locker[] = [];

  for (const grupo of groupBy(
    parsed.map((l) => normalizeLocker(l)),
    slotKey,
  ).values()) {
    if (grupo.length === 1) {
      unicos.push(grupo[0]);
      continue;
    }
    const mantido = grupo.reduce((a, b) => (isOcupado(a) || !isOcupado(b) ? a : b));
    const descartados = grupo.filter((l) => l !== mantido);
    const nomes = new Set(grupo.filter(isOcupado).map((l) => ocupanteKey(l.ocupante)));
    conflitosArquivo.push({
      numero: mantido.numero,
      localizacao: mantido.localizacao,
      mantido,
      descartados,
      motivo:
        nomes.size > 1
          ? "Armário aparece com ocupantes diferentes — mantida a primeira linha ocupada, revise as demais."
          : "Armário repetido no arquivo — mantida a linha com ocupante.",
    });
    unicos.push(mantido);
  }

  const existentesPorSlot = groupBy(existing, slotKey);
  /** Se a base já tem o armário duplicado, grava no registro que já usa a grafia padrão
   *  (senão o UPDATE colidiria na restrição única); caso contrário, no que tem dados. */
  const alvo = (l: Locker): Locker | undefined => {
    const grupo = existentesPorSlot.get(slotKey(l));
    if (!grupo) return undefined;
    return (
      grupo.find(
        (e) =>
          e.vestiario === l.vestiario && e.localizacao === l.localizacao && e.numero === l.numero,
      ) ?? grupo.reduce(preferido)
    );
  };

  const novos: Locker[] = [];
  const atualizados: ImportPlan["atualizados"] = [];
  let semAlteracao = 0;
  const resultadoPorId = new Map(existing.map((l) => [l.id, l]));

  for (const l of unicos) {
    const atual = alvo(l);
    if (!atual) {
      novos.push(l);
      resultadoPorId.set(l.id, l);
      continue;
    }
    const depois = { ...l, id: atual.id };
    const campos = changedFields(atual, depois);
    if (campos.length) atualizados.push({ antes: atual, depois, campos });
    else semAlteracao += 1;
    resultadoPorId.set(atual.id, campos.length ? depois : atual);
  }

  const ocupantesDuplicados = [
    ...groupBy([...resultadoPorId.values()].filter(isOcupado), (l) =>
      ocupanteKey(l.ocupante),
    ).values(),
  ]
    .filter((g) => g.length > 1)
    .map((g) => ({ nome: g[0].ocupante, armarios: g.sort(compareLockers).map(rotulo) }));

  return { novos, atualizados, semAlteracao, conflitosArquivo, ocupantesDuplicados };
}

// ---------------------------------------------------------------------------
// Leitura de linhas de planilha (já parseadas para objetos)
// ---------------------------------------------------------------------------

export function headerKey(k: string): string {
  return foldText(k).replace(/[\s_\-.]/g, "");
}

export function pickField(row: Record<string, unknown>, keys: string[]): string {
  for (const k of Object.keys(row)) {
    if (keys.includes(headerKey(k))) {
      const v = row[k];
      return v == null ? "" : String(v).trim();
    }
  }
  return "";
}

/** Extrai "029" e "Corredor Externo" de "029 (Corredor Externo)", "271 ( Corredor Externo )",
 *  "402 (Vestiario" (parêntese faltando) ou "291 Vestiário". */
export function parseNumeroLocalizacao(raw: string): { numero: string; localizacao: string } {
  const text = collapse(raw);
  const withParens = text.match(/^(\S+?)\s*\(([^)]*)\)?\s*$/);
  if (withParens && withParens[2].trim()) {
    return { numero: withParens[1].trim(), localizacao: withParens[2].trim() };
  }
  const withoutParens = text.match(/^(\S+)\s+(.+)$/);
  if (withoutParens) {
    return { numero: withoutParens[1].trim(), localizacao: withoutParens[2].trim() };
  }
  return { numero: text, localizacao: "" };
}

export interface ParsedRows {
  lockers: Locker[];
  /** Problemas por linha (número da linha da planilha, contando o cabeçalho como 1). */
  warnings: string[];
}

export function lockersFromRows(
  rows: Array<Record<string, unknown>>,
  makeId: () => string,
  now = Date.now(),
): ParsedRows {
  const warnings: string[] = [];
  const lockers: Locker[] = [];

  if (rows.length) {
    const headers = Object.keys(rows[0]).map(headerKey);
    const temNumero = headers.some((h) =>
      ["numerodoarmario", "numero", "armario", "n", "no"].includes(h),
    );
    if (!temNumero) {
      warnings.push(
        'Coluna do número do armário não encontrada. Use o cabeçalho "NUMERO DO ARMARIO" (ou "Número").',
      );
      return { lockers, warnings };
    }
  }

  rows.forEach((row, i) => {
    const linha = i + 2;
    const vestiarioRaw = pickField(row, ["vestiario"]);
    const nomeRaw = pickField(row, ["nome1", "nome", "ocupante", "colaborador"]);
    const setorRaw = pickField(row, ["setor"]);
    const numeroRaw = pickField(row, ["numerodoarmario", "numero", "armario", "n", "no"]);
    const localRaw = pickField(row, ["local", "localizacao"]);
    const situacaoRaw = pickField(row, ["situacao", "status", "observacao"]);

    if (!vestiarioRaw && !numeroRaw && !nomeRaw) return; // linha em branco

    const parsed = parseNumeroLocalizacao(numeroRaw);
    const numero = normalizeNumero(parsed.numero);
    if (!numero) {
      warnings.push(`Linha ${linha}: sem número de armário — ignorada.`);
      return;
    }
    const localizacao = normalizeLocalizacao(localRaw || parsed.localizacao);
    if (!localizacao) warnings.push(`Linha ${linha}: armário ${numero} sem local informado.`);

    lockers.push(
      normalizeLocker({
        id: makeId(),
        vestiario: vestiarioRaw || "Masculino",
        localizacao,
        numero,
        ocupante: nomeRaw,
        setor: setorRaw,
        situacao: situacaoRaw,
        updatedAt: now,
      }),
    );
  });

  return { lockers, warnings };
}

/** Linhas para exportação (mesmo cabeçalho aceito pela importação — ida e volta sem perda). */
export function lockersToRows(list: Locker[]): Array<Record<string, string>> {
  return [...list].sort(compareLockers).map((l) => ({
    Vestiário: l.vestiario,
    Local: l.localizacao,
    "NUMERO DO ARMARIO": l.numero,
    NOME1: l.ocupante,
    SETOR: l.setor,
    SITUAÇÃO: l.situacao,
  }));
}
