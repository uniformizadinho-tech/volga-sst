import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import {
  loadInstructors,
  saveInstructors,
  newInstructorId,
  upsertInstructor,
  removeInstructor,
  renameInstructor,
  isBuiltInInstructorId,
  type SavedInstructor,
} from "@/lib/instructors-store";
import type { SharedFields } from "@/lib/certificate-template";

/**
 * Estado e ações de instrutores (principal e "do meio") da tela de
 * Certificados, extraídos de `src/routes/certificados.tsx` para reduzir o
 * tamanho do arquivo de rota. Nenhuma lógica foi alterada — é um recorte
 * 1:1 do que já existia, apenas reorganizado como hook e usando os
 * parâmetros `shared`/`setShared` no lugar do closure da rota.
 */
export function useInstructors(
  shared: SharedFields,
  setShared: Dispatch<SetStateAction<SharedFields>>,
) {
  const [instructors, setInstructors] = useState<SavedInstructor[]>([]);
  const [instructorsOpen, setInstructorsOpen] = useState(false);
  const [newInstName, setNewInstName] = useState("");

  // Hidratação (evita hydration-mismatch: só lê localStorage depois de montar)
  useEffect(() => {
    setInstructors(loadInstructors());
  }, []);

  // Outra aba do mesmo navegador salvou instrutores: recarrega para as duas
  // telas não ficarem com listas diferentes (e uma sobrescrever a outra).
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === "volga:cert-instructors:v1" || e.key === "volga:cert-instructors-hidden:v1") {
        setInstructors(loadInstructors());
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const persistInstructors = (list: SavedInstructor[]) => {
    if (!saveInstructors(list)) {
      toast.error(
        "Não foi possível salvar os instrutores neste navegador. Verifique o armazenamento e tente novamente.",
      );
      return false;
    }
    setInstructors(list);
    return true;
  };
  const applyInstructor = (id: string) => {
    const it = instructors.find((i) => i.id === id);
    if (!it) return;
    setShared((s) => ({
      ...s,
      instrutorNome: it.nome,
      instrutorCargo: it.cargo,
      instrutorRegistro: it.registro,
    }));
    toast.success(`Instrutor "${it.name}" aplicado`);
  };
  const applyMeioInstructor = (id: string) => {
    const it = instructors.find((i) => i.id === id);
    if (!it) return;
    setShared((s) => ({
      ...s,
      instrutorMeioNome: it.nome,
      instrutorMeioCargo: it.cargo,
      instrutorMeioRegistro: it.registro,
    }));
    toast.success(`Instrutor "${it.name}" aplicado na assinatura do meio`);
  };
  const clearMeioInstructor = () => {
    setShared((s) => ({
      ...s,
      instrutorMeioNome: "",
      instrutorMeioCargo: "",
      instrutorMeioRegistro: "",
    }));
  };

  const saveCurrentInstructor = () => {
    const nome = shared.instrutorNome.trim();
    const name = newInstName.trim() || nome;
    if (!nome) {
      toast.error("Preencha o nome do instrutor");
      return;
    }
    const cargo = shared.instrutorCargo.trim();
    const registro = shared.instrutorRegistro.trim();
    const existing = instructors.find(
      (i) =>
        !isBuiltInInstructorId(i.id) &&
        i.nome.trim() === nome &&
        i.cargo.trim() === cargo &&
        i.registro.trim() === registro,
    );
    const inst: SavedInstructor = {
      id: existing?.id ?? newInstructorId(),
      name,
      nome,
      cargo,
      registro,
      updatedAt: Date.now(),
    };
    if (!persistInstructors(upsertInstructor(instructors, inst))) return;
    setNewInstName("");
    toast.success(`Instrutor "${name}" salvo`);
  };
  const deleteInstructor = (id: string) => {
    persistInstructors(removeInstructor(instructors, id));
  };
  const renameInstructorById = (id: string, name: string) => {
    if (isBuiltInInstructorId(id)) return;
    persistInstructors(renameInstructor(instructors, id, name));
  };
  const currentInstructorId = useMemo(() => {
    return (
      instructors.find(
        (i) =>
          i.nome === shared.instrutorNome &&
          i.cargo === shared.instrutorCargo &&
          i.registro === shared.instrutorRegistro,
      )?.id ?? ""
    );
  }, [instructors, shared.instrutorNome, shared.instrutorCargo, shared.instrutorRegistro]);

  const [meioAberto, setMeioAberto] = useState(false);
  const usaInstrutorMeioDiferente = meioAberto || Boolean((shared.instrutorMeioNome ?? "").trim());
  const currentMeioInstructorId = useMemo(() => {
    return (
      instructors.find(
        (i) =>
          i.nome === shared.instrutorMeioNome &&
          i.cargo === shared.instrutorMeioCargo &&
          i.registro === shared.instrutorMeioRegistro,
      )?.id ?? ""
    );
  }, [
    instructors,
    shared.instrutorMeioNome,
    shared.instrutorMeioCargo,
    shared.instrutorMeioRegistro,
  ]);

  return {
    instructors,
    instructorsOpen,
    setInstructorsOpen,
    newInstName,
    setNewInstName,
    applyInstructor,
    applyMeioInstructor,
    clearMeioInstructor,
    saveCurrentInstructor,
    deleteInstructor,
    renameInstructorById,
    currentInstructorId,
    meioAberto,
    setMeioAberto,
    usaInstrutorMeioDiferente,
    currentMeioInstructorId,
  };
}
