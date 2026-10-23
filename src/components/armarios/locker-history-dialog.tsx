import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { loadLockerHistory, type LockerHistoryEntry } from "@/lib/lockers-store";

const ACAO: Record<string, string> = { INSERT: "Criado", UPDATE: "Alterado", DELETE: "Excluído" };

function resumo(e: LockerHistoryEntry): string {
  const a = e.antes,
    d = e.depois;
  if (e.acao === "INSERT") return d?.ocupante ? `Ocupante: ${d.ocupante}` : "Armário livre";
  if (e.acao === "DELETE") return a?.ocupante ? `Ocupante era: ${a.ocupante}` : "";
  const partes: string[] = [];
  if ((a?.ocupante ?? "") !== (d?.ocupante ?? "")) {
    if (!d?.ocupante) partes.push(`Liberado (saiu ${a?.ocupante})`);
    else if (!a?.ocupante) partes.push(`Ocupado por ${d.ocupante}`);
    else partes.push(`Trocado: ${a.ocupante} → ${d.ocupante}`);
  }
  if ((a?.setor ?? "") !== (d?.setor ?? ""))
    partes.push(`Setor: ${a?.setor || "—"} → ${d?.setor || "—"}`);
  if ((a?.situacao ?? "") !== (d?.situacao ?? ""))
    partes.push(`Situação: ${a?.situacao || "—"} → ${d?.situacao || "—"}`);
  if ((a?.numero ?? "") !== (d?.numero ?? "")) partes.push(`Número: ${a?.numero} → ${d?.numero}`);
  if (
    (a?.vestiario ?? "") !== (d?.vestiario ?? "") ||
    (a?.localizacao ?? "") !== (d?.localizacao ?? "")
  )
    partes.push("Local alterado");
  return partes.join(" · ") || "Sem mudança visível";
}

export function LockerHistoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [rows, setRows] = useState<LockerHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    loadLockerHistory()
      .then(setRows)
      .catch((e) => {
        console.error(e);
        setError(
          "Não foi possível carregar o histórico. Verifique se o arquivo SQL de histórico foi rodado no Supabase.",
        );
      })
      .finally(() => setLoading(false));
  }, [open]);

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((e) =>
      JSON.stringify([e.antes, e.depois, e.usuario_email]).toLowerCase().includes(t),
    );
  }, [rows, q]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Histórico dos armários</DialogTitle>
          <DialogDescription>
            Últimas 500 mudanças feitas por qualquer pessoa da equipe.
          </DialogDescription>
        </DialogHeader>
        <Input
          placeholder="Buscar por nome, número, setor ou usuário"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="max-h-[60vh] overflow-y-auto">
          {loading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {error && <p className="py-6 text-sm text-destructive">{error}</p>}
          {!loading && !error && !filtrados.length && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma mudança registrada ainda.
            </p>
          )}
          <ul className="divide-y divide-border">
            {filtrados.map((e) => {
              const l = e.depois ?? e.antes;
              return (
                <li key={e.id} className="py-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-foreground">
                      Armário {l?.numero}{" "}
                      <span className="text-muted-foreground">
                        · {l?.vestiario} {l?.localizacao}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(e.created_at).toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <div className="mt-1 text-foreground">
                    {ACAO[e.acao] ?? e.acao} — {resumo(e)}
                  </div>
                  {e.usuario_email && (
                    <div className="text-xs text-muted-foreground">por {e.usuario_email}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
