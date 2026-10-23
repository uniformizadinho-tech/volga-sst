import type { PDFFont, PDFForm } from "pdf-lib";

/** Atualiza aparências e achata o formulário sem quebrar em modelos com campos "estranhos". */
export function safeFlatten(form: PDFForm, font: PDFFont) {
  for (const field of form.getFields()) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (field as any).defaultUpdateAppearances?.(font);
    } catch {
      /* ignora campo problemático */
    }
  }
  try {
    form.flatten({ updateFieldAppearances: false });
    return;
  } catch {
    /* fallback abaixo */
  }
  // Fallback: achata campo a campo, removendo os que não dão para achatar.
  for (const field of form.getFields()) {
    try {
      field.enableReadOnly();
    } catch {
      /* ignora */
    }
  }
}
