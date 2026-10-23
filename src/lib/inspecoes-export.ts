import { NIVEL_LABEL, SITUACAO_LABEL } from "./inspecoes-cadastro";
import { TIPO_LABEL, type Equipamento } from "./inspecoes";
import { csvRow } from "./csv-safe";

const COLUNAS = [
  "codigo",
  "equipamento",
  "tipo",
  "andar_setor",
  "localizacao",
  "pendencia",
  "nivel",
  "situacao",
  "acao",
  "responsavel",
  "prazo",
];

export function equipamentosPendenciasParaCsv(equipamentos: Equipamento[]): string {
  const linhas = equipamentos.flatMap((equipamento) =>
    (equipamento.pendencias?.length ? equipamento.pendencias : [undefined]).map((pendencia) => [
      equipamento.codigo,
      equipamento.nome,
      TIPO_LABEL[equipamento.tipo],
      equipamento.setor,
      equipamento.local,
      pendencia?.descricao,
      pendencia ? NIVEL_LABEL[pendencia.nivel] : "",
      pendencia ? SITUACAO_LABEL[pendencia.situacao] : "Sem pendência",
      pendencia?.acao,
      pendencia?.responsavel,
      pendencia?.prazo,
    ]),
  );

  return "\uFEFF" + [csvRow(COLUNAS), ...linhas.map((linha) => csvRow(linha))].join("\r\n");
}
