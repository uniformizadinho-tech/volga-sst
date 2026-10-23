import { CHECKLIST, temNC, type Equipamento, type Inspecao, type Resposta } from "./inspecoes";

export interface ItemChecklist {
  titulo: string;
  orientacao?: string;
}
const EXTINTOR: ItemChecklist[] = [
  {
    titulo: "Extintor presente no local",
    orientacao: "Confira o ponto identificado e a presença do equipamento.",
  },
  {
    titulo: "Acesso desobstruído",
    orientacao: "Verifique se é possível alcançar e retirar o extintor.",
  },
  { titulo: "Sinalização visível", orientacao: "Confira placa e identificação do ponto." },
  {
    titulo: "Suporte / fixação correta",
    orientacao: "Confira estabilidade e ausência de danos no suporte.",
  },
  { titulo: "Lacre intacto", orientacao: "Confira o lacre sem removê-lo." },
  {
    titulo: "Pino de segurança presente",
    orientacao: "Confira presença e integridade sem acionar o extintor.",
  },
  {
    titulo: "Cilindro sem danos aparentes",
    orientacao: "Procure corrosão, amassados e sinais de vazamento.",
  },
  {
    titulo: "Mangote e bico em bom estado",
    orientacao: "Verifique rachaduras, obstruções e conexões aparentes.",
  },
  {
    titulo: "Manômetro na faixa verde",
    orientacao: "Quando houver manômetro, confira a faixa de operação.",
  },
  {
    titulo: "Etiqueta legível",
    orientacao: "Confira identificação, agente, capacidade e instruções.",
  },
  {
    titulo: "Recarga / manutenção dentro da validade",
    orientacao: "Confira a data na etiqueta; sem informação, registre a pendência.",
  },
  {
    titulo: "Teste hidrostático dentro da validade",
    orientacao: "Confira a identificação do teste e o vencimento informado.",
  },
  {
    titulo: "Pintura de piso",
    orientacao: "Confira a demarcação quando exigida para o ponto; caso contrário, marque N/A.",
  },
];

export function checklistPara(e: Equipamento): ItemChecklist[] {
  if (e.tipo !== "extintor") return CHECKLIST[e.tipo].map((titulo) => ({ titulo }));
  const co2 = /co[₂²2]/i.test(e.classe ?? "");
  return EXTINTOR.filter((i) => !co2 || i.titulo !== "Manômetro na faixa verde");
}

export function respostasIniciais(): Record<string, Resposta> {
  return {};
}

export function validarInspecao(e: Equipamento, i: Inspecao, hoje: string): string | null {
  if (checklistPara(e).some((item) => !["ok", "nc", "na"].includes(i.respostas[item.titulo])))
    return "Confira todos os itens antes de salvar.";
  if (!i.inspetor.trim()) return "Informe o inspetor.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.data) || Number.isNaN(Date.parse(i.data)) || i.data > hoje)
    return "Informe uma data válida, até hoje.";
  if (temNC(i)) {
    if (!i.observacao.trim()) return "Descreva a não conformidade.";
    if (!i.acaoCorretiva?.trim() || !i.responsavel?.trim() || !i.prazo)
      return "Informe ação corretiva, responsável e prazo.";
    if (i.prazo < i.data) return "O prazo não pode ser anterior à inspeção.";
  }
  return null;
}

export function naoConformidadesAbertas(db: { inspecoes: Inspecao[] }, equipamentoId?: string) {
  return db.inspecoes.filter(
    (i) => (!equipamentoId || i.equipamentoId === equipamentoId) && temNC(i) && !i.corrigidoEm,
  );
}
