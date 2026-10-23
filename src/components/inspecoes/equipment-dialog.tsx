import { useState } from "react";
import { Check, Minus, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { checklistPara } from "@/lib/inspecoes-checklist";
import { NIVEL_LABEL, SITUACAO_LABEL, validarCadastro } from "@/lib/inspecoes-cadastro";
import {
  novoId,
  TIPO_LABEL,
  type Equipamento,
  type NivelPendencia,
  type PendenciaEquipamento,
  type Resposta,
  type TipoEquip,
} from "@/lib/inspecoes";

export function EquipmentDialog({
  eq,
  novo,
  onClose,
  onSave,
  onRemove,
}: {
  eq: Equipamento;
  novo: boolean;
  onClose: () => void;
  onSave: (e: Equipamento) => void;
  onRemove: () => void;
}) {
  const [f, setF] = useState<Equipamento>({
    ...eq,
    checklistCadastro: eq.checklistCadastro ?? {},
    pendencias: eq.pendencias ?? [],
  });
  const itens = checklistPara(f);
  const set = <K extends keyof Equipamento>(k: K, value: Equipamento[K]) =>
    setF((p) => ({ ...p, [k]: value }));
  const patchPendencia = (id: string, patch: Partial<PendenciaEquipamento>) =>
    set(
      "pendencias",
      f.pendencias?.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );
  const responder = (item: string, resposta: Resposta | undefined) => {
    const respostas = { ...f.checklistCadastro };
    if (resposta) respostas[item] = resposta;
    else delete respostas[item];
    const pendencias = [...(f.pendencias ?? [])];
    if (
      resposta === "nc" &&
      !pendencias.some((p) => p.itemChecklist === item && p.situacao !== "resolvida")
    )
      pendencias.push({
        id: novoId(),
        descricao: item,
        itemChecklist: item,
        nivel: "medio",
        acao: "",
        origem: "cadastro",
        situacao: "aberta",
      });
    setF({ ...f, checklistCadastro: respostas, pendencias });
  };
  const erro = validarCadastro(f, novo);
  const respondidos = itens.filter((i) => f.checklistCadastro?.[i.titulo]).length;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-5">
          <DialogTitle>{novo ? "Adicionar equipamento" : f.codigo}</DialogTitle>
          <DialogDescription>{novo ? "Cadastro do equipamento" : f.nome}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto px-6 py-5">
          <section className="space-y-4">
            <h3 className="flex items-center gap-3 text-base font-semibold">
              <span className="text-xs text-muted-foreground">01</span> Identificação
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="text-sm">
                Código *
                <Input
                  value={f.codigo}
                  onChange={(e) => set("codigo", e.target.value)}
                  placeholder="EX-001"
                />
              </label>
              <label className="text-sm sm:col-span-2">
                Equipamento / item *
                <Input
                  value={f.nome ?? ""}
                  onChange={(e) => set("nome", e.target.value)}
                  placeholder="Extintor ABC"
                />
              </label>
              <label className="text-sm">
                Tipo
                <Select
                  value={f.tipo}
                  onValueChange={(v) => setF({ ...f, tipo: v as TipoEquip, checklistCadastro: {} })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TIPO_LABEL) as TipoEquip[]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {TIPO_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="text-sm">
                Andar / setor *
                <Input value={f.setor} onChange={(e) => set("setor", e.target.value)} />
              </label>
              <label className="text-sm">
                Localização *
                <Input
                  value={f.local}
                  onChange={(e) => set("local", e.target.value)}
                  placeholder="Ao lado da porta 3"
                />
              </label>
              {f.tipo === "extintor" && (
                <>
                  <label className="text-sm">
                    Agente / classe
                    <Input
                      value={f.classe ?? ""}
                      onChange={(e) => set("classe", e.target.value)}
                      placeholder="ABC, BC, CO₂"
                    />
                  </label>
                  <label className="text-sm">
                    Capacidade
                    <Input
                      value={f.capacidade ?? ""}
                      onChange={(e) => set("capacidade", e.target.value)}
                      placeholder="6 kg"
                    />
                  </label>
                  <label className="text-sm">
                    Vencimento da recarga
                    <Input
                      type="date"
                      value={f.vencRecarga ?? ""}
                      onChange={(e) => set("vencRecarga", e.target.value)}
                    />
                  </label>
                </>
              )}
              {(f.tipo === "extintor" || f.tipo === "hidrante") && (
                <label className="text-sm">
                  Vencimento do teste
                  <Input
                    type="date"
                    value={f.vencTesteHidro ?? ""}
                    onChange={(e) => set("vencTesteHidro", e.target.value)}
                  />
                </label>
              )}
              <details className="sm:col-span-3">
                <summary className="cursor-pointer text-sm text-muted-foreground">
                  Projeto e referência técnica
                </summary>
                <div className="mt-3 grid gap-4 sm:grid-cols-3">
                  <label className="text-sm sm:col-span-2">
                    Informação do projeto
                    <Input
                      value={f.projeto ?? ""}
                      onChange={(e) => set("projeto", e.target.value)}
                    />
                  </label>
                  <label className="text-sm">
                    Referência
                    <Input
                      value={f.referencia ?? ""}
                      onChange={(e) => set("referencia", e.target.value)}
                    />
                  </label>
                </div>
              </details>
            </div>
            {f.revisaoNecessaria && (
              <label className="flex items-start gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={f.revisaoNecessaria}
                  onChange={(e) => set("revisaoNecessaria", e.target.checked)}
                />{" "}
                Identificação do ponto precisa de revisão
              </label>
            )}
          </section>
          <section className="mt-6 space-y-3 border-t border-border pt-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-3 text-base font-semibold">
                <span className="text-xs text-muted-foreground">02</span> Checklist do equipamento
              </h3>
              <span className="text-xs text-muted-foreground">
                {respondidos}/{itens.length} verificados
              </span>
            </div>
            <div className="divide-y divide-border">
              {itens.map((i) => (
                <div
                  key={i.titulo}
                  className="flex flex-col items-start justify-between gap-3 py-4 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{i.titulo}</p>
                    {i.orientacao && (
                      <p className="mt-1 max-w-lg text-xs text-muted-foreground">{i.orientacao}</p>
                    )}
                    {f.checklistCadastro?.[i.titulo] === "nc" && (
                      <p className="mt-1 text-xs text-destructive">
                        {f.pendencias?.some(
                          (p) => p.itemChecklist === i.titulo && p.situacao !== "resolvida",
                        )
                          ? "Pendência aberta vinculada"
                          : "Correção registrada · resultado original preservado"}
                      </p>
                    )}
                    {!f.checklistCadastro?.[i.titulo] && (
                      <p className="text-xs text-muted-foreground">
                        {eq.levantamento ? "Não informado — conferir" : "Não verificado"}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1" role="group" aria-label={i.titulo}>
                    {(
                      [
                        { value: "ok", label: "Conforme", Icon: Check },
                        { value: "nc", label: "Não conforme", Icon: X },
                        { value: "na", label: "Não se aplica", Icon: Minus },
                      ] as const
                    ).map(({ value, label, Icon }) => (
                      <Button
                        key={value}
                        type="button"
                        size="sm"
                        className="min-w-0 gap-1 px-2 text-xs"
                        title={label}
                        aria-label={`${label}: ${i.titulo}`}
                        aria-pressed={f.checklistCadastro?.[i.titulo] === value}
                        variant={
                          f.checklistCadastro?.[i.titulo] === value
                            ? value === "nc"
                              ? "destructive"
                              : "default"
                            : "outline"
                        }
                        onClick={() => responder(i.titulo, value)}
                      >
                        <Icon size={14} />
                        <span>{value === "na" ? "N/A" : label}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="mt-6 space-y-4 border-t border-border pt-5">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-3 text-base font-semibold">
                <span className="text-xs text-muted-foreground">03</span> Pendências
              </h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  set("pendencias", [
                    ...(f.pendencias ?? []),
                    {
                      id: novoId(),
                      descricao: "",
                      nivel: "medio",
                      acao: "",
                      situacao: "aberta",
                      origem: "cadastro",
                    },
                  ])
                }
              >
                <Plus size={15} /> Pendência
              </Button>
            </div>
            {!f.pendencias?.length && (
              <p className="py-3 text-sm text-muted-foreground">Nenhuma pendência registrada.</p>
            )}
            {f.pendencias?.map((p, index) => (
              <div
                key={p.id}
                className={`space-y-3 border-l-2 pl-4 ${p.situacao === "resolvida" ? "border-success" : p.nivel === "critico" ? "border-destructive" : p.nivel === "alto" ? "border-warning" : "border-border"}`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground">
                    {NIVEL_LABEL[p.nivel].toUpperCase()} · PENDÊNCIA {index + 1}
                    {p.origem === "planilha" ? " · MATRIZ" : ""}
                  </p>
                  {p.origem === "cadastro" && (
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Remover pendência"
                      aria-label="Remover pendência"
                      onClick={() =>
                        set(
                          "pendencias",
                          f.pendencias?.filter((x) => x.id !== p.id),
                        )
                      }
                    >
                      <Trash2 size={15} />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="text-sm sm:col-span-2">
                    Pendência *
                    <Textarea
                      value={p.descricao}
                      onChange={(e) => patchPendencia(p.id, { descricao: e.target.value })}
                    />
                  </label>
                  <label className="text-sm">
                    Nível da pendência *
                    <Select
                      value={p.nivel}
                      onValueChange={(v) => patchPendencia(p.id, { nivel: v as NivelPendencia })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(NIVEL_LABEL) as NivelPendencia[]).map((n) => (
                          <SelectItem key={n} value={n}>
                            {NIVEL_LABEL[n]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="text-sm sm:col-span-2">
                    Ação necessária
                    <Input
                      value={p.acao}
                      onChange={(e) => patchPendencia(p.id, { acao: e.target.value })}
                    />
                  </label>
                  <label className="text-sm">
                    Situação
                    <Select
                      value={p.situacao}
                      onValueChange={(v) =>
                        patchPendencia(p.id, { situacao: v as PendenciaEquipamento["situacao"] })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(SITUACAO_LABEL).map(([v, label]) => (
                          <SelectItem key={v} value={v}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="text-sm sm:col-span-2">
                    Responsável
                    <Input
                      value={p.responsavel ?? ""}
                      onChange={(e) => patchPendencia(p.id, { responsavel: e.target.value })}
                    />
                  </label>
                  <label className="text-sm">
                    Prazo
                    <Input
                      type="date"
                      value={p.prazo ?? ""}
                      onChange={(e) => patchPendencia(p.id, { prazo: e.target.value })}
                    />
                  </label>
                  {p.situacao === "resolvida" && (
                    <label className="text-sm sm:col-span-3">
                      Correção realizada *
                      <Textarea
                        value={p.correcao ?? ""}
                        onChange={(e) => patchPendencia(p.id, { correcao: e.target.value })}
                      />
                    </label>
                  )}
                </div>
              </div>
            ))}
          </section>
          {eq.levantamento && (
            <details className="mt-6 border-t border-border pt-4 text-sm">
              <summary className="cursor-pointer text-muted-foreground">
                Referência original da planilha
              </summary>
              <dl className="mt-3 space-y-2">
                {Object.entries(eq.levantamento).map(
                  ([key, value]) =>
                    value && (
                      <div key={key}>
                        <dt className="text-xs text-muted-foreground">{key}</dt>
                        <dd>{value}</dd>
                      </div>
                    ),
                )}
              </dl>
            </details>
          )}
        </div>
        <DialogFooter className="shrink-0 items-center border-t border-border bg-background px-6 py-4">
          <div className="mr-auto min-w-0">
            {erro && <p className="max-w-md text-xs text-muted-foreground">{erro}</p>}
            {!novo && (
              <Button variant="ghost" size="sm" onClick={onRemove}>
                <Trash2 size={14} /> Desativar
              </Button>
            )}
          </div>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!!erro}
            onClick={() =>
              onSave({
                ...f,
                codigo: f.codigo.trim().toUpperCase(),
                pendencias: f.pendencias?.map((p) => ({
                  ...p,
                  resolvidaEm:
                    p.situacao === "resolvida"
                      ? (p.resolvidaEm ?? new Date().toISOString().slice(0, 10))
                      : undefined,
                })),
              })
            }
          >
            {novo ? "Adicionar equipamento" : "Salvar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
