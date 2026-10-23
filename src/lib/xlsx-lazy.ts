/**
 * A biblioteca de planilhas (xlsx) é grande (~400 KB). Ela só é baixada quando alguém
 * importa ou exporta uma planilha, em vez de pesar no carregamento de cada tela.
 */
export type XlsxModule = typeof import("xlsx");

let loading: Promise<XlsxModule> | null = null;

export function loadXlsx(): Promise<XlsxModule> {
  if (!loading) {
    loading = import("xlsx").catch((error) => {
      loading = null; // permite tentar de novo se a rede falhar
      throw new Error(
        "Não foi possível carregar o leitor de planilhas. Verifique a conexão e tente novamente.",
        { cause: error },
      );
    });
  }
  return loading;
}
