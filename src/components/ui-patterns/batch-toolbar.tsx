import { confirmar } from "./confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Check, X } from "lucide-react";

export interface BatchActionItem {
  id: string;
  [key: string]: unknown;
}

export interface BatchActionConfig {
  label: string;
  action: "delete" | "update-field" | "toggle-field" | "custom";
  /**
   * Para "update-field": { fieldName: string, value: any }
   * Para "toggle-field": { fieldName: string }
   * Para "custom": será passado para onCustomAction
   */
  payload?: unknown;
  requiresConfirm?: boolean;
  confirmMessage?: string;
}

export interface BatchToolbarProps<T extends BatchActionItem> {
  selectedIds: Set<string>;
  onSelectAll: (selected: boolean) => void;
  totalItems: number;
  actions: BatchActionConfig[];
  onExecute: (action: BatchActionConfig, selectedIds: string[]) => Promise<void>;
  onCustomAction?: (action: BatchActionConfig, selectedIds: string[]) => Promise<void>;
  isLoading?: boolean;
}

/**
 * Barra de ferramentas para ações em lote. Exibe checkboxes "selecionar tudo",
 * contador de itens selecionados, e botões de ação (deletar, atualizar, etc).
 *
 * Uso:
 * - Passar selectedIds (Set), handlers de select/deselect
 * - Definir actions com tipo + payload
 * - Hook de validação/confirmação fica por conta do implementador
 */
export function BatchToolbar<T extends BatchActionItem>({
  selectedIds,
  onSelectAll,
  totalItems,
  actions,
  onExecute,
  onCustomAction,
  isLoading = false,
}: BatchToolbarProps<T>) {
  if (selectedIds.size === 0) return null;

  const handleAction = async (action: BatchActionConfig) => {
    if (
      action.requiresConfirm &&
      !(await confirmar({ titulo: action.confirmMessage || "Tem certeza?", perigo: true }))
    ) {
      return;
    }

    const ids = Array.from(selectedIds);
    if (action.action === "custom" && onCustomAction) {
      await onCustomAction(action, ids);
    } else {
      await onExecute(action, ids);
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-primary text-primary-foreground p-4 flex items-center justify-between border-t">
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={selectedIds.size > 0 && selectedIds.size === totalItems}
            ref={(el) => {
              if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < totalItems;
            }}
            onChange={(e) => onSelectAll(e.currentTarget.checked)}
            disabled={isLoading}
            className="w-4 h-4"
          />
          <span className="text-sm font-medium">
            {selectedIds.size} {selectedIds.size === 1 ? "item" : "itens"} selecionado
            {selectedIds.size !== 1 ? "s" : ""}
          </span>
        </label>
      </div>

      <div className="flex items-center gap-2">
        {actions.map((action, idx) => (
          <Button
            key={idx}
            variant="secondary"
            size="sm"
            onClick={() => handleAction(action)}
            disabled={isLoading}
            className={action.action === "delete" ? "bg-destructive hover:bg-destructive/90" : ""}
          >
            {action.action === "delete" && <Trash2 className="w-4 h-4 mr-2" />}
            {action.action === "custom" && <Check className="w-4 h-4 mr-2" />}
            {action.label}
          </Button>
        ))}

        <Button variant="ghost" size="sm" onClick={() => onSelectAll(false)} disabled={isLoading}>
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
