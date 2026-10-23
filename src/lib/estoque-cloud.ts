import { supabase } from "@/lib/supabase";
import type { EstoqueItem, EstoqueLancamento } from "@/lib/estoque-store";
interface ItemRow {
  cod_barras: string;
  sku: string;
  tipo: string | null;
  item: string;
  cor: string | null;
  tamanho: string | null;
  estoque_sistema: number;
  preco: number | string | null;
  updated_at: number;
}
interface LancamentoRow {
  id: string;
  cod_barras: string;
  quantidade: number;
  motivo: EstoqueLancamento["motivo"];
  created_at: string;
  created_by: string;
}
export interface EstadoEstoqueNuvem {
  itens: EstoqueItem[];
  lancamentos: EstoqueLancamento[];
}
const PENDENTES_EXCLUSAO = "volga:estoque-nuvem-pendentes:v1";
export interface ExclusoesPendentes {
  itens: string[];
  lancamentos: string[];
}
export function carregarExclusoesPendentes(): ExclusoesPendentes {
  try {
    const x = JSON.parse(
      typeof window === "undefined"
        ? "null"
        : (window.localStorage.getItem(PENDENTES_EXCLUSAO) ?? "null"),
    );
    return {
      itens: Array.isArray(x?.itens) ? x.itens : [],
      lancamentos: Array.isArray(x?.lancamentos) ? x.lancamentos : [],
    };
  } catch {
    return { itens: [], lancamentos: [] };
  }
}
export function registrarExclusoesPendentes(p: ExclusoesPendentes): void {
  if (typeof window === "undefined") return;
  const old = carregarExclusoesPendentes();
  window.localStorage.setItem(
    PENDENTES_EXCLUSAO,
    JSON.stringify({
      itens: [...new Set([...old.itens, ...p.itens])],
      lancamentos: [...new Set([...old.lancamentos, ...p.lancamentos])],
    }),
  );
}
export function limparExclusoesPendentes(p: ExclusoesPendentes): void {
  if (typeof window === "undefined") return;
  const old = carregarExclusoesPendentes();
  const a = new Set(p.itens),
    b = new Set(p.lancamentos);
  window.localStorage.setItem(
    PENDENTES_EXCLUSAO,
    JSON.stringify({
      itens: old.itens.filter((x) => !a.has(x)),
      lancamentos: old.lancamentos.filter((x) => !b.has(x)),
    }),
  );
}

/** Resolve conflitos do catálogo por updatedAt: mantém a versão mais recente; no empate, a nuvem prevalece. */
export function reconciliarItensEstoque(
  local: EstoqueItem[],
  remoto: EstoqueItem[],
): { itens: EstoqueItem[]; paraEnviar: EstoqueItem[] } {
  const locais = new Map(local.map((it) => [it.codBarras, it]));
  const remotos = new Map(remoto.map((it) => [it.codBarras, it]));
  const codigos = new Set([...remotos.keys(), ...locais.keys()]);
  const itens: EstoqueItem[] = [];
  const paraEnviar: EstoqueItem[] = [];
  for (const codigo of codigos) {
    const l = locais.get(codigo);
    const c = remotos.get(codigo);
    if (!c && l) {
      itens.push(l);
      paraEnviar.push(l);
      continue;
    }
    if (c && l && l.updatedAt > c.updatedAt) {
      itens.push(l);
      paraEnviar.push(l);
      continue;
    }
    if (c) itens.push(c);
  }
  itens.sort((a, b) => a.item.localeCompare(b.item, "pt-BR"));
  return { itens, paraEnviar };
}
function cliente() {
  if (!supabase) throw new Error("Supabase não configurado.");
  return supabase;
}
function itemLocal(r: ItemRow): EstoqueItem {
  return {
    codBarras: r.cod_barras,
    sku: r.sku,
    tipo: r.tipo ?? "",
    item: r.item,
    cor: r.cor ?? "",
    tamanho: r.tamanho ?? "",
    estoqueSistema: Number(r.estoque_sistema),
    preco: r.preco === null ? null : Number(r.preco),
    updatedAt: Number(r.updated_at),
  };
}
function eventoLocal(r: LancamentoRow): EstoqueLancamento {
  return {
    id: r.id,
    codBarras: r.cod_barras,
    quantidade: Number(r.quantidade),
    createdAt: new Date(r.created_at).getTime(),
    motivo: r.motivo ?? "leitura",
  };
}
async function todas<T>(
  table: "estoque_itens" | "estoque_lancamentos",
  columns: string,
  order: string,
): Promise<T[]> {
  const c = cliente();
  const out: T[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await c
      .from(table)
      .select(columns)
      .order(order, { ascending: true })
      .range(start, start + 999);
    if (error) throw error;
    const page = (data ?? []) as T[];
    out.push(...page);
    if (page.length < 1000) return out;
  }
}
export async function carregarEstoqueNuvem(): Promise<EstadoEstoqueNuvem> {
  const [a, b] = await Promise.all([
    todas<ItemRow>(
      "estoque_itens",
      "cod_barras,sku,tipo,item,cor,tamanho,estoque_sistema,preco,updated_at",
      "cod_barras",
    ),
    todas<LancamentoRow>(
      "estoque_lancamentos",
      "id,cod_barras,quantidade,motivo,created_at,created_by",
      "created_at",
    ),
  ]);
  return { itens: a.map(itemLocal), lancamentos: b.map(eventoLocal) };
}
export async function gravarItensEstoqueNuvem(items: EstoqueItem[]): Promise<void> {
  if (!items.length) return;
  const c = cliente();
  const rows = items.map((it) => ({
    cod_barras: it.codBarras,
    sku: it.sku,
    tipo: it.tipo || null,
    item: it.item,
    cor: it.cor || null,
    tamanho: it.tamanho || null,
    estoque_sistema: it.estoqueSistema,
    preco: it.preco,
    updated_at: it.updatedAt,
  }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await c
      .from("estoque_itens")
      .upsert(rows.slice(i, i + 200), { onConflict: "cod_barras" });
    if (error) throw error;
  }
}
export async function adicionarLancamentosEstoqueNuvem(
  events: EstoqueLancamento[],
  userId: string,
): Promise<void> {
  if (!events.length) return;
  const c = cliente();
  const rows = events.map((e) => ({
    id: e.id,
    cod_barras: e.codBarras,
    quantidade: e.quantidade,
    motivo: e.motivo ?? "leitura",
    created_at: new Date(e.createdAt).toISOString(),
    created_by: userId,
  }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await c
      .from("estoque_lancamentos")
      .upsert(rows.slice(i, i + 200), { onConflict: "id", ignoreDuplicates: true });
    if (error) throw error;
  }
}
export async function removerLancamentosEstoqueNuvem(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const c = cliente();
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await c
      .from("estoque_lancamentos")
      .delete()
      .in("id", ids.slice(i, i + 200));
    if (error) throw error;
  }
}
export async function removerItensEstoqueNuvem(codes: string[]): Promise<void> {
  if (!codes.length) return;
  const c = cliente();
  for (let i = 0; i < codes.length; i += 200) {
    const { error } = await c
      .from("estoque_itens")
      .delete()
      .in("cod_barras", codes.slice(i, i + 200));
    if (error) throw error;
  }
}
export function normalizarIdLancamento(id: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
    return id;
  const h = (seed: number) => {
    let x = (2166136261 ^ seed) >>> 0;
    for (let i = 0; i < id.length; i++) x = Math.imul(x ^ id.charCodeAt(i), 16777619) >>> 0;
    return x.toString(16).padStart(8, "0");
  };
  const a = (h(0) + h(1) + h(2) + h(3)).split("");
  a[12] = "4";
  a[16] = ((parseInt(a[16], 16) & 3) | 8).toString(16);
  const x = a.join("");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
