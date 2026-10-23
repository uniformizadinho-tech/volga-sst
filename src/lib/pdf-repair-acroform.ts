import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef } from "pdf-lib";

/**
 * Alguns modelos chegam com o /AcroForm do catálogo apontando para um objeto
 * errado (ex.: um stream de aparência), o que faz o pdf-lib quebrar em
 * getForm(). Aqui reconstruímos um /AcroForm válido a partir dos widgets
 * existentes nas páginas.
 */
export function repairAcroForm(doc: PDFDocument) {
  const catalog = doc.catalog;
  const raw = catalog.get(PDFName.of("AcroForm"));
  const resolved = raw ? doc.context.lookup(raw) : undefined;
  if (resolved instanceof PDFDict && resolved.get(PDFName.of("Fields"))) return;

  const fields: PDFRef[] = [];
  for (const page of doc.getPages()) {
    const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      const ref = annots.get(i);
      const annot = doc.context.lookup(ref);
      if (!(annot instanceof PDFDict) || !(ref instanceof PDFRef)) continue;
      const subtype = annot.get(PDFName.of("Subtype"));
      if (subtype?.toString() !== "/Widget") continue;
      // Só campos de topo (sem /Parent) entram em /Fields.
      if (annot.get(PDFName.of("Parent"))) continue;
      fields.push(ref);
    }
  }

  const acro = doc.context.obj({
    Fields: fields,
    NeedAppearances: true,
  });
  catalog.set(PDFName.of("AcroForm"), doc.context.register(acro));
}
