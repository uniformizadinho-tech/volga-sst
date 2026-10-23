/**
 * Cache local e formatos do módulo de contagem.
 * Quando há sessão autenticada, o Supabase é a fonte compartilhada; o localStorage
 * mantém o funcionamento local e a fila de operações pendentes para recuperação.
 */

export interface EstoqueItem {
  codBarras: string;
  sku: string;
  tipo: string;
  item: string;
  cor: string;
  tamanho: string;
  estoqueSistema: number;
  preco: number | null;
  updatedAt: number;
}

/** Uma correção manual de contagem feita durante a bipagem (robusto a erro de digitação: cada
 *  lançamento guarda SEU PRÓPRIO valor, nunca sobrescreve — pode ser desfeito individualmente). */
export interface EstoqueLancamento {
  id: string;
  codBarras: string;
  quantidade: number;
  createdAt: number;
  motivo?: "leitura" | "correcao" | "conferencia";
}

const ITENS_KEY = "volga:estoque-itens:v2";
const LANCAMENTOS_KEY = "volga:estoque-lancamentos:v2";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch (err) {
    console.error(`Estoque: não foi possível ler "${key}" do armazenamento local.`, err);
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error(`Estoque: não foi possível salvar "${key}" no armazenamento local.`, err);
    return false;
  }
}

export function carregarEstoqueItens(): EstoqueItem[] {
  return readJson<EstoqueItem[]>(ITENS_KEY, []);
}

/** `true` se salvou com sucesso; `false` se o navegador recusou (ex.: armazenamento cheio/privado) —
 *  a tela deve avisar o usuário nesse caso em vez de assumir silenciosamente que salvou. */
export function salvarEstoqueItens(itens: EstoqueItem[]): boolean {
  return writeJson(ITENS_KEY, itens);
}

export function carregarLancamentos(): EstoqueLancamento[] {
  return readJson<EstoqueLancamento[]>(LANCAMENTOS_KEY, []);
}

export function salvarLancamentos(lancamentos: EstoqueLancamento[]): boolean {
  return writeJson(LANCAMENTOS_KEY, lancamentos);
}

function gerarId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === "x" ? r : (r & 3) | 8).toString(16);
  });
}

export function novoLancamento(
  codBarras: string,
  quantidade: number,
  motivo: EstoqueLancamento["motivo"] = "leitura",
): EstoqueLancamento {
  return { id: gerarId(), codBarras, quantidade, createdAt: Date.now(), motivo };
}

/** Soma líquida (pode haver mais de um lançamento por item — correções, bipagens em lotes
 *  diferentes do dia etc.) — é a "quantidade contada" mostrada na tabela. */
export function somarContagemPorCodigo(lancamentos: EstoqueLancamento[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const l of lancamentos) {
    map.set(l.codBarras, (map.get(l.codBarras) ?? 0) + l.quantidade);
  }
  return map;
}

export function mesclarCatalogoImportado(
  atual: EstoqueItem[],
  importados: EstoqueItem[],
): { resultado: EstoqueItem[]; novos: number; atualizados: number; semAlteracao: number } {
  const porCodigo = new Map(atual.map((it) => [it.codBarras, it]));
  let novos = 0;
  let atualizados = 0;
  let semAlteracao = 0;

  for (const it of importados) {
    const existente = porCodigo.get(it.codBarras);
    if (!existente) {
      novos += 1;
    } else if (
      existente.tipo !== it.tipo ||
      existente.sku !== it.sku ||
      existente.item !== it.item ||
      existente.cor !== it.cor ||
      existente.tamanho !== it.tamanho ||
      existente.estoqueSistema !== it.estoqueSistema ||
      existente.preco !== it.preco
    ) {
      atualizados += 1;
    } else {
      semAlteracao += 1;
    }
    porCodigo.set(
      it.codBarras,
      existente &&
        existente.tipo === it.tipo &&
        existente.sku === it.sku &&
        existente.item === it.item &&
        existente.cor === it.cor &&
        existente.tamanho === it.tamanho &&
        existente.estoqueSistema === it.estoqueSistema &&
        existente.preco === it.preco
        ? existente
        : it,
    );
  }

  return { resultado: Array.from(porCodigo.values()), novos, atualizados, semAlteracao };
}

/** Valida dados de backup antes de restaurar o catálogo e o histórico. */
export function validarBackupContagem(value: unknown): {
  itens: EstoqueItem[];
  lancamentos: EstoqueLancamento[];
} {
  if (!value || typeof value !== "object") throw new Error("Backup inválido.");
  const data = value as Record<string, unknown>;
  if (
    data.tipo !== "volga-contagem-backup" ||
    data.versao !== 1 ||
    !Array.isArray(data.itens) ||
    !Array.isArray(data.lancamentos)
  ) {
    throw new Error("Arquivo não é um backup de contagem compatível.");
  }
  const codes = new Set<string>();
  const ids = new Set<string>();
  for (const it of data.itens) {
    if (
      !it ||
      typeof it !== "object" ||
      typeof it.codBarras !== "string" ||
      !it.codBarras.trim() ||
      typeof it.sku !== "string" ||
      typeof it.item !== "string" ||
      !Number.isSafeInteger(it.estoqueSistema) ||
      it.estoqueSistema < 0 ||
      codes.has(it.codBarras)
    ) {
      throw new Error("Backup contém itens inválidos ou códigos duplicados.");
    }
    codes.add(it.codBarras);
  }
  const totals = new Map<string, number>();
  for (const l of data.lancamentos) {
    if (
      !l ||
      typeof l !== "object" ||
      typeof l.id !== "string" ||
      !l.id ||
      ids.has(l.id) ||
      typeof l.codBarras !== "string" ||
      !codes.has(l.codBarras) ||
      !Number.isSafeInteger(l.quantidade) ||
      !Number.isFinite(l.createdAt)
    ) {
      throw new Error("Backup contém lançamentos inválidos, duplicados ou sem produto.");
    }
    ids.add(l.id);
    const total = (totals.get(l.codBarras) ?? 0) + l.quantidade;
    if (!Number.isSafeInteger(total) || total < 0)
      throw new Error("Backup contém total de contagem inválido.");
    totals.set(l.codBarras, total);
  }
  return {
    itens: data.itens as EstoqueItem[],
    lancamentos: data.lancamentos as EstoqueLancamento[],
  };
}
