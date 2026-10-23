import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export interface ConfirmOptions {
  titulo: string;
  descricao?: string;
  confirmar?: string;
  cancelar?: string;
  /** Ação que apaga ou altera algo importante: botão em vermelho. */
  perigo?: boolean;
}

type Pedido = ConfirmOptions & { responder: (ok: boolean) => void };

let mostrar: ((pedido: Pedido) => void) | null = null;

/**
 * Pede confirmação no diálogo padrão do app. Uso: `if (!(await confirmar({...}))) return;`
 * Sem o <ConfirmHost /> montado (ex.: testes isolados), usa a confirmação do navegador.
 */
export function confirmar(opcoes: ConfirmOptions): Promise<boolean> {
  if (!mostrar) {
    const texto = opcoes.descricao ? `${opcoes.titulo}\n\n${opcoes.descricao}` : opcoes.titulo;
    return Promise.resolve(typeof window !== "undefined" && window.confirm(texto));
  }
  const abrir = mostrar;
  return new Promise((resolve) => abrir({ ...opcoes, responder: resolve }));
}

/** Monte uma vez na raiz do app. */
export function ConfirmHost() {
  const [pedido, setPedido] = useState<Pedido | null>(null);

  useEffect(() => {
    mostrar = (novo) =>
      setPedido((atual) => {
        atual?.responder(false); // um pedido novo cancela o anterior
        return novo;
      });
    return () => {
      mostrar = null;
    };
  }, []);

  const fechar = (ok: boolean) => {
    pedido?.responder(ok);
    setPedido(null);
  };

  return (
    <AlertDialog open={!!pedido} onOpenChange={(aberto) => !aberto && fechar(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{pedido?.titulo}</AlertDialogTitle>
          {pedido?.descricao && <AlertDialogDescription>{pedido.descricao}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => fechar(false)}>
            {pedido?.cancelar ?? "Cancelar"}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => fechar(true)}
            className={cn(
              pedido?.perigo &&
                "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            )}
          >
            {pedido?.confirmar ?? "Confirmar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
