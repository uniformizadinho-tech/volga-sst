// Download dos modelos (PPTX/PDF) com cache em memória e novas tentativas.
// Evita baixar o mesmo arquivo várias vezes durante um lote e sobrevive a
// quedas momentâneas de rede quando várias pessoas usam o app ao mesmo tempo.

const cache = new Map<string, ArrayBuffer>();
const inFlight = new Map<string, Promise<ArrayBuffer>>();
const DOWNLOAD_TIMEOUT_MS = 15_000;
const MIN_TEMPLATE_BYTES = 128;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function download(url: string, label: string): Promise<ArrayBuffer> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        cache: "force-cache",
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      if (buf.byteLength < MIN_TEMPLATE_BYTES) throw new Error("arquivo vazio ou incompleto");
      const signature = String.fromCharCode(...new Uint8Array(buf.slice(0, 4)));
      const isPptx = url.toLowerCase().includes(".pptx") && signature.startsWith("PK");
      const isPdf = url.toLowerCase().includes(".pdf") && signature === "%PDF";
      if (!isPptx && !isPdf) throw new Error("formato de arquivo inválido");
      return buf;
    } catch (err) {
      lastError =
        err instanceof DOMException && err.name === "AbortError"
          ? new Error("tempo de carregamento excedido")
          : err;
      if (attempt < 2) await sleep(400 * (attempt + 1));
    } finally {
      window.clearTimeout(timeout);
    }
  }
  throw new Error(
    `Não foi possível carregar ${label}. Verifique a conexão e tente novamente. (${
      lastError instanceof Error ? lastError.message : String(lastError)
    })`,
  );
}

/**
 * Retorna uma cópia do conteúdo do modelo. A cópia evita que o consumidor
 * altere o buffer guardado no cache.
 */
export async function fetchTemplateBuffer(url: string, label = "o modelo"): Promise<ArrayBuffer> {
  const cached = cache.get(url);
  if (cached) return cached.slice(0);

  let pending = inFlight.get(url);
  if (!pending) {
    pending = download(url, label)
      .then((buf) => {
        cache.set(url, buf);
        return buf;
      })
      .finally(() => {
        inFlight.delete(url);
      });
    inFlight.set(url, pending);
  }

  const buf = await pending;
  return buf.slice(0);
}
