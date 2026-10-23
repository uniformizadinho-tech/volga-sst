import { Badge } from "@/components/ui/badge";
import type { EstoqueItem } from "@/lib/estoque-store";

/**
 * Helper de divergência e badge visual da tela de Estoque, extraídos de
 * `src/routes/estoque.tsx` para reduzir o tamanho do arquivo de rota.
 * Nenhuma lógica foi alterada — recorte 1:1 do que já existia.
 */

export function diferenca(item: EstoqueItem, contados: Map<string, number>): number {
  return (contados.get(item.codBarras) ?? 0) - item.estoqueSistema;
}

export function DiferencaBadge({ diff }: { diff: number }) {
  if (diff === 0) return <Badge variant="secondary">OK</Badge>;
  if (diff > 0)
    return <Badge className="bg-accent/15 text-accent dark:text-accent">+{diff} sobra</Badge>;
  return <Badge variant="destructive">{diff} falta</Badge>;
}
