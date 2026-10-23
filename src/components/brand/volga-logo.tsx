import { useEffect, useRef, useState } from "react";
import logoAsset from "@/assets/volga-logo.png.asset.json";
import { cn } from "@/lib/utils";

/**
 * Logo da Volga. A imagem fica hospedada pela Lovable; fora dela (por exemplo na
 * Vercel) o arquivo não existe. Quando a imagem não carrega, mostra o nome
 * "VOLGA" no lugar, em vez de um ícone de imagem quebrada.
 */
export function VolgaLogo({
  className,
  width,
  height,
  decorative = false,
}: {
  className?: string;
  width?: number;
  height?: number;
  /** Marca d'água: sem texto alternativo para leitores de tela. */
  decorative?: boolean;
}) {
  const [falhou, setFalhou] = useState(!logoAsset?.url);
  const imgRef = useRef<HTMLImageElement>(null);

  // Se a imagem falhou antes de o React assumir a página, o onError não dispara.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setFalhou(true);
  }, []);

  if (falhou) {
    return (
      <span
        className={cn("volga-wordmark", className)}
        style={
          height ? { fontSize: Math.round(height * 0.62), lineHeight: `${height}px` } : undefined
        }
        {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": "Volga" })}
      >
        VOLGA
      </span>
    );
  }

  return (
    <img
      ref={imgRef}
      src={logoAsset.url}
      alt={decorative ? "" : "Volga"}
      aria-hidden={decorative || undefined}
      width={width}
      height={height}
      className={className}
      onError={() => setFalhou(true)}
    />
  );
}
