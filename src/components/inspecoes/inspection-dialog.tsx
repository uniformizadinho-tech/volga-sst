import { useEffect, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { checklistPara, respostasIniciais, validarInspecao } from "@/lib/inspecoes-checklist";
import {
  novoId,
  statusVencimento,
  TIPO_LABEL,
  type Equipamento,
  type Inspecao,
  type Resposta,
} from "@/lib/inspecoes";

export const dataLocalISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

async function reduzirFoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, 960 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a foto.");
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.7);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function InspectionDialog({
  eq,
  onClose,
  onSave,
}: {
  eq: Equipamento;
  onClose: () => void;
  onSave: (i: Inspecao, proximo: boolean) => void;
}) {
  const itens = checklistPara(eq);
  const [respostas, setRespostas] = useState(respostasIniciais);
  const [inspetor, setInspetor] = useState("");
  useEffect(() => {
    try {
      setInspetor(localStorage.getItem("volga:inspetor") ?? "");
    } catch {
      /* optional preference */
    }
  }, []);
  const [data, setData] = useState(dataLocalISO);
  const [observacao, setObservacao] = useState("");
  const [acaoCorretiva, setAcao] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [prazo, setPrazo] = useState("");
  const [foto, setFoto] = useState<string>();
  const [fotoCarregando, setFotoCarregando] = useState(false);
  const nc = Object.values(respostas).includes("nc");
  const registro: Inspecao = {
    id: "",
    equipamentoId: eq.id,
    data,
    inspetor,
    respostas,
    observacao,
    foto,
    ...(nc ? { acaoCorretiva, responsavel, prazo } : {}),
  };
  const erro = validarInspecao(eq, registro, dataLocalISO());
  const respondidos = itens.filter((i) => respostas[i.titulo]).length;
  const salvar = (proximo: boolean) => {
    if (erro) {
      toast.error(erro);
      return;
    }
    try {
      localStorage.setItem("volga:inspetor", inspetor.trim());
    } catch {
      /* optional preference */
    }
    onSave(
      {
        ...registro,
        id: novoId(),
        inspetor: inspetor.trim(),
        observacao: observacao.trim(),
        acaoCorretiva: nc ? acaoCorretiva.trim() : undefined,
        responsavel: nc ? responsavel.trim() : undefined,
      },
      proximo,
    );
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {eq.codigo} · {TIPO_LABEL[eq.tipo]}
          </DialogTitle>
          <DialogDescription>
            {eq.setor} · {eq.local}
          </DialogDescription>
        </DialogHeader>
        {eq.levantamento && (
          <section className="space-y-1 border-b border-border pb-3 text-sm">
            <h3 className="font-semibold">
              Levantamento da planilha · {eq.levantamento.prioridade}
            </h3>
            <p>{eq.levantamento.descricao}</p>
            <p className="text-muted-foreground">Ação recomendada: {eq.levantamento.acao}</p>
            <p className="text-xs text-muted-foreground">
              Situação original: {eq.levantamento.status}
            </p>
          </section>
        )}
        {eq.tipo === "extintor" && (
          <div className="text-sm">
            <p>
              Recarga:{" "}
              {eq.vencRecarga ? eq.vencRecarga.split("-").reverse().join("/") : "A conferir"} ·
              Teste:{" "}
              {eq.vencTesteHidro ? eq.vencTesteHidro.split("-").reverse().join("/") : "A conferir"}
            </p>
            {statusVencimento(eq) === "vencido" && (
              <p className="font-medium text-destructive">Recarga ou teste vencido</p>
            )}
          </div>
        )}
        <div className="space-y-3">
          <p className="text-sm font-medium" aria-live="polite">
            {respondidos} de {itens.length} itens verificados
          </p>
          <div className="divide-y divide-border">
            {itens.map((item) => (
              <fieldset key={item.titulo} className="space-y-2 py-3">
                <legend className="sr-only">{item.titulo}</legend>
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <p className="text-sm font-medium">{item.titulo}</p>
                  {!respostas[item.titulo] && (
                    <span className="text-xs text-muted-foreground">Não verificado</span>
                  )}
                </div>
                {item.orientacao && (
                  <p className="text-xs text-muted-foreground">{item.orientacao}</p>
                )}
                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      ["ok", "Conforme"],
                      ["nc", "Não conforme"],
                      ["na", "N/A"],
                    ] as Array<[Resposta, string]>
                  ).map(([value, label]) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      aria-pressed={respostas[item.titulo] === value}
                      variant={
                        respostas[item.titulo] === value
                          ? value === "nc"
                            ? "destructive"
                            : "default"
                          : "outline"
                      }
                      onClick={() => setRespostas((p) => ({ ...p, [item.titulo]: value }))}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Inspetor
              <Input value={inspetor} onChange={(e) => setInspetor(e.target.value)} />
            </label>
            <label className="text-sm">
              Data
              <Input
                type="date"
                max={dataLocalISO()}
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </label>
          </div>
          <label className="block text-sm">
            {nc ? "Descrição da não conformidade *" : "Observação"}
            <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </label>
          {nc && (
            <section className="space-y-3 border-t border-border pt-3">
              <h3 className="text-sm font-semibold">Ação corretiva</h3>
              <label className="block text-sm">
                O que precisa ser feito *
                <Textarea value={acaoCorretiva} onChange={(e) => setAcao(e.target.value)} />
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  Responsável *
                  <Input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} />
                </label>
                <label className="text-sm">
                  Prazo *
                  <Input
                    type="date"
                    min={data}
                    value={prazo}
                    onChange={(e) => setPrazo(e.target.value)}
                  />
                </label>
              </div>
            </section>
          )}
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <Camera size={16} />
            {fotoCarregando ? "Preparando foto…" : foto ? "Trocar foto" : "Anexar foto"}
            <input
              aria-label="Foto da inspeção"
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setFotoCarregando(true);
                try {
                  setFoto(await reduzirFoto(file));
                } catch {
                  toast.error("Não foi possível abrir a foto.");
                } finally {
                  setFotoCarregando(false);
                }
              }}
            />
          </label>
          {foto && (
            <div className="flex items-start gap-2">
              <img src={foto} alt="Foto da inspeção" className="max-h-40 max-w-full rounded" />
              <Button
                size="icon"
                variant="ghost"
                aria-label="Remover foto"
                onClick={() => setFoto(undefined)}
              >
                <Trash2 size={16} />
              </Button>
            </div>
          )}
          {erro && <p className="text-xs text-muted-foreground">{erro}</p>}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={!!erro || fotoCarregando}
            onClick={() => salvar(false)}
          >
            Salvar
          </Button>
          <Button disabled={!!erro || fotoCarregando} onClick={() => salvar(true)}>
            Salvar e próximo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
