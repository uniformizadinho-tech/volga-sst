import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterBarProps {
  /**
   * Texto de busca.
   */
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;

  /**
   * Conjunto de filtros opcionais. Cada filtro é um select com valor/label.
   * Exemplo: [{ label: 'Status', value: 'statusFilter', options: [{value: 'todos', label: 'Todos'}, ...] }]
   */
  filters?: Array<{
    label: string;
    value: string;
    options: FilterOption[];
    onValueChange: (value: string) => void;
  }>;

  /**
   * Ações (botões) à direita do filtro, ex: export/import.
   */
  actions?: React.ReactNode;

  /**
   * Espaço após search + filtros e antes das ações.
   */
  className?: string;
}

/**
 * Barra consolidada de busca + filtros, reutilizável em Armários, Estoque e
 * outras telas. Reduz reimplementação do mesmo padrão em múltiplas rotas.
 */
export function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Buscar…",
  filters = [],
  actions,
  className = "",
}: FilterBarProps) {
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      {/* Search */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Filters */}
      {filters.map((filter) => (
        <Select key={filter.value} value={filter.value} onValueChange={filter.onValueChange}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder={filter.label} />
          </SelectTrigger>
          <SelectContent>
            {filter.options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}

      {/* Spacer */}
      <div className="flex-grow" />

      {/* Actions */}
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
