import { resumoMes, statusVencimento, type InspecoesDB } from "./inspecoes";
import { adaptarCadastro, pendenciasAbertas, prazoVencido } from "./inspecoes-cadastro";

/** Resumo do mês corrente usado pelo dashboard e pela fila operacional. */
export function resumirInspecoesPainel(db: InspecoesDB, hoje: Date) {
  const adaptado = adaptarCadastro(db);
  const ativos = adaptado.equipamentos.filter((equipamento) => equipamento.ativo);
  const mes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  const data = `${mes}-${String(hoje.getDate()).padStart(2, "0")}`;
  const resumo = resumoMes(adaptado, mes, hoje);
  const pendencias = ativos.flatMap((equipamento) => pendenciasAbertas(equipamento));

  return {
    ativos: ativos.length,
    feitos: resumo.feitos,
    pendentes: resumo.pendentes,
    cobertura: resumo.cobertura,
    totalPendencias: pendencias.length,
    criticas: pendencias.filter((pendencia) => pendencia.nivel === "critico").length,
    atrasadas: pendencias.filter((pendencia) => prazoVencido(pendencia, data)).length,
    vencidos: ativos.filter((equipamento) => statusVencimento(equipamento, hoje) === "vencido")
      .length,
  };
}
