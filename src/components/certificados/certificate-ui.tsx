import { memo, useEffect, useState, type ReactNode, type ButtonHTMLAttributes } from "react";
import { ArrowUp, ArrowDown, Copy, Trash2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatSignatureName } from "@/lib/certificate-template";
import type { Colaborador, SharedFields } from "@/lib/certificate-template";
import { normalizeCollaboratorIdentity } from "@/lib/collaborator-preparation";
import { VolgaLogo } from "@/components/brand/volga-logo";

/**
 * Peças de apresentação da tela de Certificados, extraídas de
 * `src/routes/certificados.tsx` (que concentrava ~3.000 linhas em um único
 * arquivo). Nenhuma lógica foi alterada aqui — é um recorte 1:1 do que já
 * existia, movido para reduzir o tamanho do arquivo de rota.
 */

export function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function IconBtn({
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  // Todos os usos de IconBtn são botões só com ícone (mover, duplicar, remover
  // etc.) e usavam apenas `title` (tooltip visível no hover). Leitores de tela
  // e toque em mobile não têm hover, então ficavam sem nome acessível nenhum.
  // Derivar aria-label do title aqui corrige isso em todos os usos de uma vez.
  const derivedLabel =
    props["aria-label"] ?? (typeof props.title === "string" ? props.title : undefined);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("h-8 w-8", className)}
      aria-label={derivedLabel}
      {...props}
    >
      {children}
    </Button>
  );
}

// Extraído do map() original: cada linha de colaborador é um componente memoizado
// próprio. Antes, as linhas viviam inline no JSX do componente pai e QUALQUER
// tecla digitada em UM campo recriava o array `cols` inteiro, forçando o React a
// reconciliar todas as linhas (até 300) x ~10 elementos a cada keystroke (lag em
// listas grandes). Com React.memo + callbacks estáveis (useCallback no pai), só a
// linha efetivamente alterada re-renderiza.
interface ColRowProps {
  index: number;
  nome: string;
  cpf: string;
  included: boolean;
  isSelected: boolean;
  isPreview: boolean;
  cpfInvalid: boolean;
  duplicated: boolean;
  isFirst: boolean;
  isLast: boolean;
  isOnly: boolean;
  onUpdate: (idx: number, key: keyof Colaborador, value: string) => void;
  onToggleSelect: (idx: number) => void;
  onToggleIncluded: (idx: number) => void;
  onSetPreview: (idx: number) => void;
  onMove: (idx: number, dir: -1 | 1) => void;
  onDuplicate: (idx: number) => void;
  onRemove: (idx: number) => void;
  onEnterAtLast: () => void;
}

export const ColRow = memo(function ColRow({
  index,
  nome,
  cpf,
  included,
  isSelected,
  isPreview,
  cpfInvalid,
  duplicated,
  isFirst,
  isLast,
  isOnly,
  onUpdate,
  onToggleSelect,
  onToggleIncluded,
  onSetPreview,
  onMove,
  onDuplicate,
  onRemove,
  onEnterAtLast,
}: ColRowProps) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        isSelected
          ? "border-accent bg-accent/10"
          : isPreview
            ? "border-accent bg-accent/5"
            : "border-border",
        !included && "opacity-60",
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelect(index)}
          title="Selecionar para ações em lote"
        />
        <Checkbox
          checked={included}
          onCheckedChange={() => onToggleIncluded(index)}
          title={included ? "Incluído na geração" : "Excluído da geração"}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSetPreview(index)}
          className="h-auto px-1 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Colaborador {index + 1}
        </Button>
        {!included && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            NÃO INCLUÍDO
          </span>
        )}
        {duplicated && (
          <span className="rounded bg-warning-soft px-1.5 py-0.5 text-[10px] font-medium text-warning">
            DUPLICADO
          </span>
        )}
        {cpfInvalid && (
          <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
            CPF INVÁLIDO
          </span>
        )}
        {isPreview && (
          <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground">
            PRÉVIA
          </span>
        )}
        <div className="ml-auto flex gap-0.5">
          <IconBtn title="Mover para cima" onClick={() => onMove(index, -1)} disabled={isFirst}>
            <ArrowUp className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn title="Mover para baixo" onClick={() => onMove(index, 1)} disabled={isLast}>
            <ArrowDown className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn title="Duplicar" onClick={() => onDuplicate(index)}>
            <Copy className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn
            title="Remover"
            onClick={() => onRemove(index)}
            disabled={isOnly}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </IconBtn>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Input
          aria-label={`Nome do colaborador ${index + 1}`}
          placeholder="Nome completo"
          value={nome}
          onChange={(e) => onUpdate(index, "nome", e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && isLast) {
              e.preventDefault();
              onEnterAtLast();
            }
          }}
        />
        <div>
          <Input
            aria-label={`CPF do colaborador ${index + 1}`}
            placeholder="000.000.000-00"
            value={cpf}
            onChange={(e) => onUpdate(index, "cpf", e.target.value)}
            inputMode="numeric"
            className={cn(cpfInvalid && "border-destructive focus-visible:ring-destructive")}
          />
          {cpfInvalid && <p className="mt-1 text-[10px] text-destructive">CPF inválido</p>}
        </div>
      </div>
    </div>
  );
});

export function CollapsibleCard({
  title,
  icon,
  storageKey,
  defaultOpen = true,
  right,
  subtitle,
  children,
}: {
  title: string;
  icon?: ReactNode;
  storageKey: string;
  defaultOpen?: boolean;
  right?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const key = `volga:card:${storageKey}`;
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(key);
      if (v !== null) setOpen(v === "1");
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(key, open ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [key, open]);
  return (
    <Card className="overflow-hidden py-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <Button
          variant="ghost"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="h-auto min-w-0 flex-1 justify-start gap-2 whitespace-normal px-1 py-2 text-left"
        >
          {icon}
          <span className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">{title}</h2>
            {subtitle && (
              <span className="block text-xs font-normal text-muted-foreground">{subtitle}</span>
            )}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              !open && "-rotate-90",
            )}
          />
        </Button>
        {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
      </div>
      {open && <div className="p-4 sm:p-5">{children}</div>}
    </Card>
  );
}

export function CertificatePreview({ shared, col }: { shared: SharedFields; col: Colaborador }) {
  const body = `Participou e concluiu o Treinamento sobre ${shared.treinamento}, realizado em ${shared.data}, com duração de ${shared.cargaHoraria}, pela empresa ${shared.empresa},  na ${shared.endereco} inscrita no CNPJ: ${shared.cnpj}. em conformidade com a norma regulamentadora ${shared.normaRef}.`;

  const previewCol = normalizeCollaboratorIdentity(col ?? { nome: "", cpf: "" });
  const nomeUpper = (previewCol.nome || "—").toUpperCase();

  return (
    <div className="sst-document-preview">
      <VolgaLogo
        decorative
        className="volga-watermark pointer-events-none absolute left-1/2 top-[55%] w-[60%] -translate-x-1/2 -translate-y-1/2 text-center opacity-[0.08] grayscale"
      />

      <div className="relative h-[24%] w-full">
        <div className="sst-document-corner absolute left-0 top-0 h-4 w-4" />
        <div className="sst-document-banner-end absolute right-0 top-[18%] h-[64%] w-[30%]" />
        <div className="sst-document-banner absolute left-0 top-[18%] flex h-[64%] w-[80%] flex-col items-center justify-center">
          <span className="sst-document-title">CERTIFICADO</span>
        </div>
      </div>

      <div className="sst-document-body">
        <p className="sst-document-eyebrow">CERTIFICAMOS QUE O COLABORADOR</p>
        <h3 className="sst-document-name">{nomeUpper}</h3>
        <div className="sst-document-rule" />
        <p className="sst-document-cpf">CPF: {previewCol.cpf || "—"}</p>
        <p className="sst-document-description">{body}</p>
      </div>

      <div className="sst-document-signatures">
        <div className="text-center">
          <div className="sst-document-signature-name">
            {previewCol.nome ? formatSignatureName(previewCol.nome) : "—"}
          </div>
          <div className="sst-document-signature-label">Colaborador</div>
        </div>
        <div className="text-center">
          <div className="sst-document-signature-name">{shared.instrutorNome}</div>
          <div className="sst-document-signature-label">
            Instrutor/Responsável Técnico
            <br />
            {shared.instrutorCargo}
            <br />
            Reg: {shared.instrutorRegistro}
          </div>
        </div>
        <VolgaLogo className="volga-doc-logo h-10 w-full object-contain text-center" />
      </div>
    </div>
  );
}
