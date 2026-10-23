import { checklistPara } from "./inspecoes-checklist";
import {
  type Equipamento,
  type InspecoesDB,
  type NivelPendencia,
  type PendenciaEquipamento,
} from "./inspecoes";

export const NIVEL_LABEL: Record<NivelPendencia, string> = {
  baixo: "Baixo",
  medio: "Médio",
  alto: "Alto",
  critico: "Crítico",
};
export const SITUACAO_LABEL = {
  aberta: "Aberta",
  andamento: "Em andamento",
  resolvida: "Resolvida",
};
export const PESO_NIVEL: Record<NivelPendencia, number> = {
  baixo: 1,
  medio: 2,
  alto: 3,
  critico: 4,
};
const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export function nivelDaPlanilha(s: string): NivelPendencia {
  const v = normalizar(s);
  return v.includes("critic")
    ? "critico"
    : v.includes("alt")
      ? "alto"
      : v.includes("baix")
        ? "baixo"
        : "medio";
}

export function adaptarEquipamento(e: Equipamento): Equipamento {
  const l = e.levantamento;
  if (!l)
    return { ...e, pendencias: e.pendencias ?? [], checklistCadastro: e.checklistCadastro ?? {} };
  const item = normalizar(l.item);
  const familias = [
    /extintor|etiqueta/.test(item) ? "extintor" : "",
    /hidrante|mangueira/.test(item) ? "hidrante" : "",
    /iluminacao|luz/.test(item) ? "iluminacao" : "",
    /sinalizacao/.test(item) ? "sinalizacao" : "",
  ].filter(Boolean);
  const tipo =
    familias.length > 1
      ? "misto"
      : familias[0] === "iluminacao"
        ? "iluminacao"
        : familias[0] === "sinalizacao"
          ? "sinalizacao"
          : e.tipo;
  const pendencias =
    e.pendencias ??
    (!/^ok$|^conforme$|^concluido$|^resolvido$/i.test(normalizar(l.status).trim())
      ? [
          {
            id: `planilha:${e.codigo.toUpperCase()}`,
            descricao: l.descricao || l.observacoes || l.acao,
            nivel: nivelDaPlanilha(l.prioridade),
            acao: l.acao,
            situacao: "aberta" as const,
            origem: "planilha" as const,
          },
        ]
      : []);
  return {
    ...e,
    tipo: e.nome !== undefined ? e.tipo : tipo,
    nome: e.nome ?? l.item,
    projeto: e.projeto ?? l.projeto,
    referencia: e.referencia ?? l.referencia,
    revisaoNecessaria: e.revisaoNecessaria ?? (familias.length > 1 || item === "etiqueta"),
    pendencias,
    checklistCadastro: e.checklistCadastro ?? {},
  };
}

export function adaptarCadastro(db: InspecoesDB): InspecoesDB {
  return {
    ...db,
    equipamentos: db.equipamentos.map((equip) => {
      const e = adaptarEquipamento(equip);
      const pendencias = [...(e.pendencias ?? [])];
      for (const i of db.inspecoes.filter(
        (i) => i.equipamentoId === e.id && Object.values(i.respostas).includes("nc"),
      )) {
        const id = `inspecao:${i.id}`;
        if (pendencias.some((p) => p.id === id)) continue;
        pendencias.push({
          id,
          descricao:
            i.observacao ||
            Object.entries(i.respostas)
              .filter(([, r]) => r === "nc")
              .map(([k]) => k)
              .join(", "),
          nivel: "medio",
          acao: i.acaoCorretiva ?? "",
          responsavel: i.responsavel,
          prazo: i.prazo,
          origem: "inspecao",
          situacao: i.corrigidoEm ? "resolvida" : "aberta",
          correcao: i.correcao,
          resolvidaEm: i.corrigidoEm,
        });
      }
      return { ...e, pendencias };
    }),
  };
}

export const pendenciasAbertas = (e: Equipamento) =>
  (e.pendencias ?? []).filter((p) => p.situacao !== "resolvida");
export function pendenciaPrincipal(e: Equipamento) {
  return pendenciasAbertas(e).sort((a, b) => PESO_NIVEL[b.nivel] - PESO_NIVEL[a.nivel])[0];
}

export function checklistConferido(e: Equipamento): boolean {
  return checklistPara(e).every((i) =>
    ["ok", "nc", "na"].includes(e.checklistCadastro?.[i.titulo] ?? ""),
  );
}
export function prazoVencido(p: PendenciaEquipamento, hoje: string): boolean {
  return p.situacao !== "resolvida" && !!p.prazo && p.prazo < hoje;
}

export function validarCadastro(e: Equipamento, novo: boolean): string | null {
  if (!e.codigo.trim() || !e.nome?.trim() || !e.setor.trim() || !e.local.trim())
    return "Preencha código, identificação e localização.";
  if (novo && !checklistConferido(e))
    return "Preencha o checklist antes de adicionar o equipamento.";
  for (const p of e.pendencias ?? []) {
    if (!p.descricao.trim() || !(p.nivel in NIVEL_LABEL))
      return "Informe a descrição e o nível de cada pendência.";
    if (p.situacao === "resolvida" && !p.correcao?.trim())
      return "Descreva a correção para resolver a pendência.";
  }
  for (const [item, resposta] of Object.entries(e.checklistCadastro ?? {})) {
    if (
      resposta === "nc" &&
      !(e.pendencias ?? []).some(
        (p) => p.itemChecklist === item && (!novo || p.situacao !== "resolvida"),
      )
    )
      return `Registre uma pendência para: ${item}.`;
  }
  return null;
}
