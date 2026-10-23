import { supabase } from "./supabase";
import { parseDateBR } from "./date-br";
import type { Colaborador, SharedFields } from "./certificate-template";

/** Registration is one server-side transaction; failed writes must never look counted. */
export async function registerCertificateEmission(
  shared: SharedFields,
  cols: Colaborador[],
  templateName?: string,
): Promise<void> {
  if (!supabase) throw new Error("Registro central indisponível.");
  const people = cols
    .filter((c) => c.incluir !== false && c.nome.trim())
    .map(({ nome, cpf }) => ({ nome: nome.trim(), cpf: cpf?.trim() || null }));
  if (!people.length) throw new Error("Nenhum colaborador incluído na emissão.");
  const date = parseDateBR(shared.data);
  const dateText = date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
    : null;
  const { error } = await supabase.rpc("registrar_emissao", {
    p_template: templateName ?? null,
    p_treinamento: shared.treinamento.trim(),
    p_norma: shared.normaRef.trim(),
    p_data: dateText,
    p_validade: shared.validadeMeses ?? 0,
    p_shared: shared,
    p_colaboradores: people,
  });
  if (error)
    throw new Error(
      "O arquivo foi gerado, mas o registro central não foi confirmado. Avise o administrador e não repita a geração sem conferir o histórico.",
    );
  await supabase.rpc("registrar_evento", {
    p_action: "CREATE",
    p_module: "CERTIFICADOS",
    p_entity_type: "certificate",
    p_description: `Certificado ${shared.treinamento.trim()} gerado para ${people.length} participante(s)`,
    p_metadata: { treinamento: shared.treinamento.trim(), participantes: people.length },
  });
}
