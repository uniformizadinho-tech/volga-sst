import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  loadTemplates,
  saveTemplates,
  syncTemplatesToCloud,
  newId,
  upsertTemplate,
  removeTemplate,
  renameTemplate,
  duplicateTemplate,
  exportTemplates,
  importTemplates,
  type SavedTemplate,
} from "@/lib/templates-store";
import type { SharedFields } from "@/lib/certificate-template";

/**
 * Gestão de modelos de certificado de `src/routes/certificados.tsx`,
 * extraída para reduzir o tamanho do arquivo de rota. A lógica de CRUD,
 * persistência local/cloud, sincronização entre abas e validação é idêntica
 * ao original — apenas reorganizado como hook.
 */
export function useTemplateManagement(
  user: { id: string } | null,
  shared: SharedFields,
  setShared: Dispatch<SetStateAction<SharedFields>>,
) {
  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  const [currentTplId, setCurrentTplId] = useState<string>("");
  const [newTplName, setNewTplName] = useState<string>("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  // Hidratação (evita hydration-mismatch)
  useEffect(() => {
    const local = loadTemplates();
    setTemplates(local);
  }, []);

  const persistTemplates = useCallback(
    (list: SavedTemplate[], deletedIds: string[] = []): boolean => {
      setTemplates(list);
      const savedLocally = saveTemplates(list);
      if (!savedLocally) {
        toast.error(
          "Não foi possível salvar neste navegador (armazenamento local bloqueado ou cheio)." +
            (user ? " Tentando salvar na nuvem…" : " Faça login para salvar na nuvem."),
        );
      }
      if (user) {
        syncTemplatesToCloud(user.id, list, deletedIds).catch((err) => {
          console.error("Falha ao sincronizar modelos com a nuvem:", err);
          toast.error(
            savedLocally
              ? "Salvo neste dispositivo, mas falhou ao sincronizar com a nuvem."
              : "Não foi possível salvar nem localmente nem na nuvem. Tente novamente.",
          );
        });
      }
      return savedLocally;
    },
    [user],
  );

  // Sincroniza com outra aba
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === "volga:cert-templates:v1") setTemplates(loadTemplates());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const currentTpl = useMemo(
    () => templates.find((t) => t.id === currentTplId) || null,
    [templates, currentTplId],
  );

  const isDirty = useMemo(() => {
    if (!currentTpl) return false;
    return JSON.stringify(currentTpl.shared) !== JSON.stringify(shared);
  }, [currentTpl, shared]);

  const handleLoadTemplate = useCallback(
    (id: string) => {
      const tpl = templates.find((t) => t.id === id);
      if (!tpl) return;
      setShared(tpl.shared);
      setCurrentTplId(id);
      toast.success(`Modelo "${tpl.name}" carregado`);
    },
    [templates, setShared],
  );

  const handleSaveAs = useCallback(() => {
    const name = newTplName.trim();
    if (!name) {
      toast.error("Dê um nome ao modelo");
      return;
    }
    const tpl: SavedTemplate = {
      id: newId(),
      name,
      shared,
      updatedAt: Date.now(),
    };
    const ok = persistTemplates(upsertTemplate(templates, tpl));
    setCurrentTplId(tpl.id);
    setNewTplName("");
    if (ok) toast.success(`Modelo "${name}" salvo`);
  }, [newTplName, shared, templates, persistTemplates]);

  const handleUpdateCurrent = useCallback(() => {
    if (!currentTpl) return;
    const updated: SavedTemplate = { ...currentTpl, shared, updatedAt: Date.now() };
    const ok = persistTemplates(upsertTemplate(templates, updated));
    if (ok) toast.success(`Modelo "${currentTpl.name}" atualizado`);
  }, [currentTpl, shared, templates, persistTemplates]);

  const handleDeleteCurrent = useCallback(() => {
    if (!currentTpl) return;
    setDeleteConfirmOpen(true);
  }, [currentTpl]);

  const confirmDeleteTemplate = useCallback(() => {
    if (!currentTpl) return;
    const ok = persistTemplates(removeTemplate(templates, currentTpl.id), [currentTpl.id]);
    setDeleteConfirmOpen(false);
    setCurrentTplId("");
    if (ok) toast.success(`Modelo "${currentTpl.name}" removido`);
  }, [currentTpl, templates, persistTemplates]);

  const handleDuplicate = useCallback(() => {
    if (!currentTpl) return;
    const dup = duplicateTemplate(currentTpl);
    const ok = persistTemplates(upsertTemplate(templates, dup));
    setCurrentTplId(dup.id);
    if (ok) toast.success(`Duplicado como "${dup.name}"`);
  }, [currentTpl, templates, persistTemplates]);

  const handleRename = useCallback(() => {
    if (!currentTpl) return;
    setRenameValue(currentTpl.name);
    setRenameOpen(true);
  }, [currentTpl]);

  const submitRename = useCallback(() => {
    if (!currentTpl) return;
    const name = renameValue.trim();
    if (!name) return;
    const ok = persistTemplates(renameTemplate(templates, currentTpl.id, name));
    setRenameOpen(false);
    if (ok) toast.success("Modelo renomeado");
  }, [currentTpl, renameValue, templates, persistTemplates]);

  const handleExportTemplates = useCallback(() => {
    const blob = new Blob([exportTemplates(templates)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `volga-modelos-${format(new Date(), "yyyy-MM-dd")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [templates]);

  const handleImportTemplatesFile = useCallback(
    async (file: File) => {
      try {
        const text = (await file.text()).trim();
        if (!text) throw new Error("Arquivo vazio");
        const merged = importTemplates(templates, text);
        const ok = persistTemplates(merged);
        if (ok) toast.success("Modelos importados");
      } catch (err) {
        console.error("Falha ao importar modelos:", err);
        const msg = err instanceof Error ? err.message : "formato desconhecido";
        toast.error(`Arquivo inválido: ${msg}`);
      }
    },
    [templates, persistTemplates],
  );

  return {
    templates,
    setTemplates,
    currentTplId,
    setCurrentTplId,
    newTplName,
    setNewTplName,
    renameOpen,
    setRenameOpen,
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    renameValue,
    setRenameValue,
    currentTpl,
    isDirty,
    handleLoadTemplate,
    handleSaveAs,
    handleUpdateCurrent,
    handleDeleteCurrent,
    confirmDeleteTemplate,
    handleDuplicate,
    handleRename,
    submitRename,
    handleExportTemplates,
    handleImportTemplatesFile,
  };
}
