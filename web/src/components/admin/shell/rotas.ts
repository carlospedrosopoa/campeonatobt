export const SECOES_TORNEIO: Record<string, string> = {
  editar: "Dados do torneio",
  arenas: "Arenas e quadras",
  apoiadores: "Apoiadores",
  "atletas-inscritos": "Atletas e inscrições",
  cobranca: "Cobrança",
  comunicacoes: "Comunicações",
  "jogos-do-dia": "Jogos do dia",
  "lista-chamada": "Lista de chamada",
  "qr-checkin": "QR do check-in",
  "painel-quadras": "Painel de quadras",
  operacao: "Operação ao vivo",
  "importar-supercampeonato": "Importar Excel",
};

export const ABAS_CATEGORIA: Record<string, string> = {
  inscricoes: "Inscrições",
  configuracao: "Configuração",
  jogos: "Jogos",
  "jogos/super": "Jogos",
  chave: "Chave",
  sorteio: "Sorteio ao vivo",
  "jogos/arbitro": "Modo árbitro",
  "jogos/lancar-placar": "Lançar placar",
};

export type RotaAdmin = {
  slug: string | null;
  secao: string | null;
  categoriaId: string | null;
  abaCategoria: string | null;
  /** telas de tela cheia (telao, arbitro no celular) renderizam sem o menu */
  telaCheia: boolean;
};

export function interpretarRota(pathname: string): RotaAdmin {
  const partes = pathname.split("/").filter(Boolean); // ["admin", "torneios", slug, ...]
  let slug: string | null = null;
  let secao: string | null = null;
  let categoriaId: string | null = null;
  let abaCategoria: string | null = null;
  let subSecao: string | null = null;

  if (partes[0] === "admin" && partes[1] === "torneios" && partes[2] && partes[2] !== "novo") {
    slug = decodeURIComponent(partes[2]);
    if (partes[3] === "categorias" && partes[4]) {
      categoriaId = partes[4];
      abaCategoria = partes.slice(5).join("/") || null;
    } else if (partes[3]) {
      secao = partes[3];
      subSecao = partes[4] ?? null;
    }
  }

  // telao e tela da quadra (celular) da operacao ao vivo tambem sao tela cheia
  const telaCheia =
    secao === "qr-checkin" ||
    (secao === "operacao" && (subSecao === "telao" || subSecao === "quadra")) || abaCategoria === "sorteio" || abaCategoria === "jogos/arbitro" || abaCategoria === "jogos/lancar-placar";
  return { slug, secao, categoriaId, abaCategoria, telaCheia };
}
