import { pushShared } from "./shared-kv";
const KEY = "volga:validades-janela:v1";
export const JANELAS_ATENCAO = [30, 60, 90] as const;

/** Janela (dias) escolhida pelo usuário para "vence em breve". Padrão 30. */
export function lerJanelaAtencao(): number {
  try {
    const n = Number(localStorage.getItem(KEY));
    return (JANELAS_ATENCAO as readonly number[]).includes(n) ? n : 30;
  } catch {
    return 30;
  }
}

export function salvarJanelaAtencao(dias: number): void {
  try {
    void pushShared(KEY, String(dias));
    localStorage.setItem(KEY, String(dias));
  } catch {
    /* navegação privada / cota: a preferência só não persiste */
  }
}
