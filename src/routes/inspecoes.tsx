import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowUpRight,
  Download,
  FileText,
  FireExtinguisher,
  History,
  Plus,
  Search,
  Upload,
  Wrench,
} from "lucide-react";
import { AppFrame } from "@/components/layout/app-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { EquipmentDialog } from "@/components/inspecoes/equipment-dialog";
import {
  adaptarCadastro,
  checklistConferido,
  prazoVencido,
  NIVEL_LABEL,
  pendenciasAbertas,
  pendenciaPrincipal,
  PESO_NIVEL,
  SITUACAO_LABEL,
} from "@/lib/inspecoes-cadastro";
import matrizRows from "@/data/extintores-matriz.json";
import {
  equipamentosDaMatriz,
  lerPlanilhaMatriz,
  mesclarEquipamentos,
} from "@/lib/inspecoes-planilha";
import {
  equipamentosFromCSV,
  equipamentosToCSV,
  ncAberta,
  TIPO_LABEL,
  loadDB,
  novoId,
  saveDB,
  statusVencimento,
  temNC,
  type Equipamento,
  type InspecoesDB,
  type NivelPendencia,
} from "@/lib/inspecoes";
import { equipamentosPendenciasParaCsv } from "@/lib/inspecoes-export";
import { useAuth } from "@/hooks/use-auth";
import { can, explainDenied } from "@/lib/permissions";

export const Route = createFileRoute("/inspecoes")({
  head: () => ({
    meta: [
      { title: "Equipamentos e pendências de incêndio — Volga SST" },
      {
        name: "description",
        content:
          "Cadastro de equipamentos de incêndio com checklist, localização e acompanhamento de pendências por prioridade.",
      },
      { property: "og:title", content: "Equipamentos e pendências de incêndio — Volga SST" },
      {
        property: "og:description",
        content: "Controle dos equipamentos, checklist de cadastro e pendências da Matriz.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InspecoesPage,
});
const VENC_LABEL = {
  vencido: "Vencido",
  vence30: "Vence em 30 dias",
  ok: "Em dia",
  sem: "A conferir",
} as const;
const nivelClass = (n: NivelPendencia) =>
  n === "critico"
    ? "border-destructive/20 bg-destructive/10 text-destructive"
    : n === "alto"
      ? "border-warning/30 bg-warning-soft text-warning"
      : n === "medio"
        ? "border-primary/20 bg-muted text-primary"
        : "border-border bg-background text-muted-foreground";

function InspecoesPage() {
  const { role } = useAuth();
  const podeEditar = can(role, "inspecoes.write");
  const [db, setDb] = useState<InspecoesDB>({ equipamentos: [], inspecoes: [] });
  const [editEq, setEditEq] = useState<Equipamento | null>(null);
  const [historico, setHistorico] = useState<Equipamento | null>(null);
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState("todos");
  const [local, setLocal] = useState("todos");
  const [nivel, setNivel] = useState("todos");
  const [situacao, setSituacao] = useState("todos");
  const [preview, setPreview] = useState<Equipamento[] | null>(null);
  useEffect(() => {
    setDb(adaptarCadastro(loadDB()));
  }, []);
  const persist = async (next: InspecoesDB) => {
    if (!podeEditar) {
      toast.error(explainDenied("inspecoes.write"));
      return false;
    }
    const normalized = adaptarCadastro(next);
    try {
      await saveDB(normalized);
      setDb(normalized);
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar. O cadastro continua aberto.",
      );
      return false;
    }
  };
  const d = new Date();
  const hoje = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const ativos = db.equipamentos.filter((e) => e.ativo);
  const pendencias = ativos.flatMap((e) => pendenciasAbertas(e));
  const q = busca.trim().toLowerCase();
  const lista = ativos
    .filter((e) => {
      const ps = e.pendencias ?? [];
      return (
        (!q ||
          `${e.codigo} ${e.nome} ${e.local} ${e.setor} ${ps.map((p) => p.descricao).join(" ")}`
            .toLowerCase()
            .includes(q)) &&
        (tipo === "todos" || e.tipo === tipo) &&
        (local === "todos" || e.setor === local) &&
        (nivel === "todos" || ps.some((p) => p.nivel === nivel && p.situacao !== "resolvida")) &&
        (situacao === "todos" ||
          (situacao === "sem"
            ? !pendenciasAbertas(e).length
            : ps.some((p) => p.situacao === situacao)))
      );
    })
    .sort(
      (a, b) =>
        PESO_NIVEL[pendenciaPrincipal(b)?.nivel ?? "baixo"] -
          PESO_NIVEL[pendenciaPrincipal(a)?.nivel ?? "baixo"] ||
        a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }),
    );
  const exportar = () => {
    const csv = equipamentosPendenciasParaCsv(lista);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "equipamentos-pendencias.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  const importar = async (f: File) => {
    try {
      const items = /\.xlsx?$/i.test(f.name)
        ? await lerPlanilhaMatriz(await f.arrayBuffer())
        : equipamentosFromCSV(await f.text());
      if (!items.length) throw new Error("Nenhum equipamento válido no arquivo.");
      setPreview(items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível ler o arquivo.");
    }
  };
  const salvar = async (e: Equipamento) => {
    if (
      db.equipamentos.some(
        (x) => x.id !== e.id && x.codigo.toUpperCase() === e.codigo.toUpperCase(),
      )
    ) {
      toast.error("Este código já está cadastrado.");
      return;
    }
    const existe = db.equipamentos.some((x) => x.id === e.id);
    const inspecoes = db.inspecoes.map((i) => {
      const p = e.pendencias?.find((p) => p.id === `inspecao:${i.id}`);
      return p
        ? {
            ...i,
            corrigidoEm: p.situacao === "resolvida" ? p.resolvidaEm : undefined,
            correcao: p.correcao,
          }
        : i;
    });
    if (
      await persist({
        ...db,
        inspecoes,
        equipamentos: existe
          ? db.equipamentos.map((x) => (x.id === e.id ? e : x))
          : [...db.equipamentos, e],
      })
    ) {
      setEditEq(null);
      toast.success("Equipamento e pendências salvos.");
    }
  };
  const confirmarImportacao = async () => {
    if (!preview) return;
    if (await persist(adaptarCadastro(mesclarEquipamentos(db, preview)))) {
      setPreview(null);
      toast.success("Cadastros e pendências importados sem duplicar registros.");
    }
  };
  const removerEquipamento = async (id: string) => {
    if (
      await persist({
        ...db,
        equipamentos: db.equipamentos.map((e) => (e.id === id ? { ...e, ativo: false } : e)),
      })
    ) {
      setEditEq(null);
    }
  };
  return (
    <AppFrame active="/inspecoes">
      <main className="sst-main mx-auto w-full max-w-[1600px] space-y-4 p-4 sm:p-6 lg:p-7">
        <header className="sst-module-heading">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
              Segurança contra incêndio
            </p>
            <h1 className="text-2xl font-semibold">Inspeções</h1>
          </div>
          <Button
            disabled={!podeEditar}
            title={podeEditar ? undefined : explainDenied("inspecoes.write")}
            onClick={() =>
              setEditEq({
                id: novoId(),
                codigo: "",
                nome: "",
                tipo: "extintor",
                setor: "",
                local: "",
                ativo: true,
                checklistCadastro: {},
                pendencias: [],
              })
            }
          >
            <Plus size={17} /> Adicionar equipamento
          </Button>
        </header>
        <section className="grid grid-cols-2 divide-x divide-border gap-y-5 border-y border-border py-5 sm:grid-cols-4">
          {[
            ["Equipamentos", ativos.length],
            ["Pendências abertas", pendencias.length],
            [
              "Alta / crítica",
              pendencias.filter((p) => p.nivel === "alto" || p.nivel === "critico").length,
            ],
            ["Checklist a conferir", ativos.filter((e) => !checklistConferido(e)).length],
          ].map(([label, value], i) => (
            <div key={label} className="px-4 first:pl-0">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p
                className={`mt-1 text-3xl font-semibold ${i === 2 && Number(value) > 0 ? "text-destructive" : ""}`}
              >
                {value}
              </p>
            </div>
          ))}
        </section>
        {!ativos.length && (
          <section className="flex flex-col items-start justify-between gap-3 border-b border-border pb-5 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-medium">Controle da Matriz</h2>
              <p className="text-sm text-muted-foreground">
                47 registros · 38 pendências identificadas
              </p>
            </div>
            <Button variant="outline" onClick={() => setPreview(equipamentosDaMatriz(matrizRows))}>
              <FileText size={16} /> Importar planilha inteira
            </Button>
          </section>
        )}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative min-w-48 flex-1 sm:max-w-sm">
              <Search size={16} className="absolute left-3 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Buscar equipamento, local ou pendência"
                aria-label="Buscar equipamentos e pendências"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-1">
              {ativos.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPreview(equipamentosDaMatriz(matrizRows))}
                >
                  <FileText size={15} /> Planilha Matriz
                </Button>
              )}
              <label>
                <Button variant="ghost" size="sm" asChild>
                  <span className="cursor-pointer">
                    <Upload size={15} /> Importar arquivo
                  </span>
                </Button>
                <input
                  aria-label="Importar planilha de equipamentos"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void importar(f);
                    e.target.value = "";
                  }}
                />
              </label>
              <Button
                variant="ghost"
                size="icon"
                title="Exportar equipamentos e pendências"
                aria-label="Exportar equipamentos e pendências"
                onClick={exportar}
              >
                <Download size={17} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="Imprimir relatório"
                aria-label="Imprimir relatório"
                onClick={() => window.print()}
              >
                <FileText size={17} />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[
              {
                value: tipo,
                set: setTipo,
                label: "Todos os tipos",
                options: Object.entries(TIPO_LABEL),
              },
              {
                value: local,
                set: setLocal,
                label: "Todos os locais",
                options: Array.from(new Set(ativos.map((e) => e.setor)))
                  .sort()
                  .map((s) => [s, s]),
              },
              {
                value: nivel,
                set: setNivel,
                label: "Todos os níveis",
                options: Object.entries(NIVEL_LABEL),
              },
              {
                value: situacao,
                set: setSituacao,
                label: "Todas as situações",
                options: [...Object.entries(SITUACAO_LABEL), ["sem", "Sem pendências"]],
              },
            ].map((f) => (
              <Select key={f.label} value={f.value} onValueChange={f.set}>
                <SelectTrigger aria-label={f.label}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">{f.label}</SelectItem>
                  {f.options.map(([v, label]) => (
                    <SelectItem key={v} value={v}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ))}
          </div>
        </section>
        <section className="border-t border-border">
          <div className="flex flex-wrap justify-between gap-2 py-3 text-xs text-muted-foreground">
            <span>{lista.length} equipamentos encontrados</span>
            <span>
              {pendencias.filter((p) => prazoVencido(p, hoje)).length} pendências com prazo vencido
            </span>
          </div>
          <div className="hidden grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1.6fr)_100px_44px] gap-4 border-b border-border bg-muted/50 px-3 py-3 text-xs font-medium text-muted-foreground lg:grid">
            <span>Equipamento</span>
            <span>Localização</span>
            <span>Pendência</span>
            <span>Nível</span>
            <span />
          </div>
          {!lista.length && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {ativos.length
                ? "Nenhum equipamento neste filtro."
                : "Nenhum equipamento cadastrado."}
            </p>
          )}
          {lista.map((e) => {
            const p = pendenciaPrincipal(e);
            return (
              <div
                key={e.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border py-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1.6fr)_100px_44px] lg:gap-4 lg:px-3"
              >
                <Button
                  variant="ghost"
                  onClick={() => setEditEq(e)}
                  className="h-auto min-w-0 flex-col items-start gap-1 whitespace-normal px-0 text-left"
                >
                  <span className="text-xs text-muted-foreground">{e.codigo}</span>
                  <span className="w-full break-words text-sm font-semibold">
                    {e.nome ?? TIPO_LABEL[e.tipo]}
                  </span>
                  {!checklistConferido(e) && (
                    <span className="text-xs text-warning">Checklist a conferir</span>
                  )}
                  {e.revisaoNecessaria && (
                    <span className="text-xs text-muted-foreground">Identificação a revisar</span>
                  )}
                </Button>
                <div className="col-start-1 min-w-0 text-sm lg:col-start-auto">
                  <p className="break-words">{e.local}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{e.setor}</p>
                  {(e.tipo === "extintor" || e.tipo === "hidrante") && (
                    <p
                      className={`mt-1 text-xs ${statusVencimento(e) === "vencido" ? "text-destructive" : "text-muted-foreground"}`}
                    >
                      {VENC_LABEL[statusVencimento(e)]}
                    </p>
                  )}
                </div>
                <div className="col-start-1 min-w-0 lg:col-start-auto">
                  {p ? (
                    <>
                      <p className="break-words text-sm">{p.descricao}</p>
                      <p
                        className={`mt-1 text-xs ${prazoVencido(p, hoje) ? "font-medium text-destructive" : "text-muted-foreground"}`}
                      >
                        {prazoVencido(p, hoje) ? "Prazo vencido · " : ""}
                        {SITUACAO_LABEL[p.situacao]}
                        {pendenciasAbertas(e).length > 1
                          ? ` · +${pendenciasAbertas(e).length - 1} pendência(s)`
                          : ""}
                        {p.prazo ? ` · Prazo ${p.prazo.split("-").reverse().join("/")}` : ""}
                      </p>
                      {p.acao && (
                        <p className="mt-1 break-words text-xs text-muted-foreground">
                          Ação: {p.acao}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {p.responsavel
                          ? `Responsável: ${p.responsavel}`
                          : "Responsável não definido"}
                      </p>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {checklistConferido(e)
                        ? "Sem pendências abertas"
                        : "Sem pendências registradas · a conferir"}
                    </span>
                  )}
                </div>
                <div className="col-start-2 row-start-1 lg:col-start-auto lg:row-start-auto">
                  {p && (
                    <span
                      className={`inline-flex rounded border px-2 py-1 text-xs font-medium ${nivelClass(p.nivel)}`}
                    >
                      {NIVEL_LABEL[p.nivel]}
                    </span>
                  )}
                </div>
                <div className="col-start-2 row-start-2 flex flex-col gap-1 lg:col-start-auto lg:row-start-auto">
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Abrir cadastro"
                    aria-label={`Abrir ${e.codigo}`}
                    onClick={() => setEditEq(e)}
                  >
                    <ArrowUpRight size={17} />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Histórico de inspeções"
                    aria-label={`Histórico de ${e.codigo}`}
                    onClick={() => setHistorico(e)}
                  >
                    <History size={16} />
                  </Button>
                </div>
              </div>
            );
          })}
          <p className="py-3 text-xs text-muted-foreground">
            {lista.length} de {ativos.length} equipamentos
          </p>
        </section>
      </main>
      {preview && (
        <Dialog open onOpenChange={(o) => !o && setPreview(null)}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Adaptar controle da Matriz</DialogTitle>
              <DialogDescription>
                {preview.length} registros · {preview.flatMap((e) => pendenciasAbertas(e)).length}{" "}
                pendências · {preview.filter((e) => e.revisaoNecessaria).length} identificações a
                revisar
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-96 divide-y divide-border overflow-y-auto">
              {preview.map((e) => (
                <div key={e.codigo} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium">
                      {e.codigo} · {e.nome ?? TIPO_LABEL[e.tipo]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {e.setor} · {e.local}
                    </p>
                    {pendenciaPrincipal(e) && (
                      <p className="mt-1 text-sm">{pendenciaPrincipal(e)?.descricao}</p>
                    )}
                  </div>
                  {pendenciaPrincipal(e) && (
                    <span className="text-xs text-muted-foreground">
                      {NIVEL_LABEL[pendenciaPrincipal(e)?.nivel ?? "medio"]}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPreview(null)}>
                Cancelar
              </Button>
              <Button disabled={!podeEditar} onClick={() => void confirmarImportacao()}>
                Confirmar importação
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {editEq && (
        <EquipmentDialog
          key={editEq.id}
          eq={editEq}
          novo={!db.equipamentos.some((e) => e.id === editEq.id)}
          onClose={() => setEditEq(null)}
          onSave={salvar}
          onRemove={() => void removerEquipamento(editEq.id)}
        />
      )}
      {historico && (
        <Dialog open onOpenChange={(o) => !o && setHistorico(null)}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Histórico · {historico.codigo}</DialogTitle>
            </DialogHeader>
            {db.inspecoes.filter((i) => i.equipamentoId === historico.id).length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma inspeção registrada.</p>
            )}
            <div className="divide-y divide-border">
              {db.inspecoes
                .filter((i) => i.equipamentoId === historico.id)
                .slice()
                .sort((a, b) => b.data.localeCompare(a.data))
                .map((i) => (
                  <section key={i.id} className="space-y-2 py-3 text-sm">
                    <h3 className="font-semibold">
                      {i.data.split("-").reverse().join("/")} · {i.inspetor}
                    </h3>
                    <p className={ncAberta(i) ? "text-destructive" : "text-muted-foreground"}>
                      {ncAberta(i)
                        ? "Não conformidade aberta"
                        : temNC(i)
                          ? "Corrigida"
                          : "Conforme"}
                    </p>
                    <dl>
                      {Object.entries(i.respostas).map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-3 py-1">
                          <dt>{k}</dt>
                          <dd className="shrink-0">
                            {v === "ok" ? "Conforme" : v === "nc" ? "Não conforme" : "N/A"}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    {i.observacao && <p>{i.observacao}</p>}
                    {i.acaoCorretiva && (
                      <p>
                        Ação: {i.acaoCorretiva} · {i.responsavel} · Prazo{" "}
                        {i.prazo?.split("-").reverse().join("/")}
                      </p>
                    )}
                    {i.corrigidoEm && (
                      <p>
                        Correção em {i.corrigidoEm.split("-").reverse().join("/")}: {i.correcao}
                      </p>
                    )}
                    {i.foto && (
                      <img
                        src={i.foto}
                        alt="Evidência da inspeção"
                        className="max-h-48 max-w-full rounded"
                      />
                    )}
                    {ncAberta(i) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setHistorico(null);
                          setEditEq(db.equipamentos.find((e) => e.id === i.equipamentoId) ?? null);
                        }}
                      >
                        <Wrench size={14} /> Dar baixa
                      </Button>
                    )}
                  </section>
                ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </AppFrame>
  );
}
