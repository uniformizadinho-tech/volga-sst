import { loadXlsx } from "./xlsx-lazy";
import { novoId, type Equipamento, type InspecoesDB, type TipoEquip } from "./inspecoes";
import { adaptarEquipamento } from "./inspecoes-cadastro";

const normalizar = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
export function equipamentosDaMatriz(rows: unknown[][]): Equipamento[] {
  return rows
    .filter((r) => /^\d+$/.test(String(r[0] ?? "")) && r[3])
    .map((r) => {
      const g = (i: number) => String(r[i] ?? "").trim();
      const item = normalizar(g(3));
      const tipo: TipoEquip =
        item.includes("extintor") || item === "etiqueta"
          ? "extintor"
          : /hidrante|mangueira/.test(item)
            ? "hidrante"
            : /bomba/.test(item)
              ? "bomba"
              : "alarme";
      const classe = g(3).match(/\b(ABC|BC|CO2)\b/i)?.[1];
      return adaptarEquipamento({
        id: novoId(),
        codigo: `MATRIZ-${g(0).padStart(3, "0")}`,
        tipo,
        setor: g(1),
        local: g(2),
        ativo: true,
        classe,
        levantamento: {
          item: g(3),
          descricao: g(4),
          status: g(5),
          prioridade: g(6),
          projeto: g(7),
          acao: g(8),
          referencia: g(9),
          observacoes: g(10),
          notas: g(11),
        },
      });
    });
}

export async function lerPlanilhaMatriz(buffer: ArrayBuffer): Promise<Equipamento[]> {
  const { read, utils } = await loadXlsx();
  const workbook = read(buffer, { type: "array" });
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const rows = utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
    const header = rows.findIndex(
      (r) => normalizar(r[0]) === "id" && normalizar(r[3]) === "item / equipamento",
    );
    if (header >= 0) return equipamentosDaMatriz(rows.slice(header + 1));
  }
  throw new Error(
    "Planilha não reconhecida. Use o controle da Matriz com as colunas ID, Andar, Localização / Setor e Item / Equipamento.",
  );
}

export function mesclarEquipamentos(db: InspecoesDB, novos: Equipamento[]): InspecoesDB {
  const incoming = new Map(novos.map((e) => [e.codigo.toUpperCase(), e]));
  const existing = new Set(db.equipamentos.map((e) => e.codigo.toUpperCase()));
  return {
    ...db,
    equipamentos: [
      ...db.equipamentos.map((e) => {
        const n = incoming.get(e.codigo.toUpperCase());
        return n
          ? adaptarEquipamento({
              ...n,
              ...e,
              levantamento: n.levantamento,
              id: e.id,
              ativo: e.ativo,
              vencRecarga: n.vencRecarga ?? e.vencRecarga,
              vencTesteHidro: n.vencTesteHidro ?? e.vencTesteHidro,
              capacidade: e.capacidade ?? n.capacidade,
            })
          : e;
      }),
      ...Array.from(incoming.values()).filter((e) => !existing.has(e.codigo.toUpperCase())),
    ],
  };
}
