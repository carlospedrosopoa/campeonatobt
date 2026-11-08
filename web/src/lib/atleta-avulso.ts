// Atleta avulso: inscrito pelo admin so com o nome, sem cadastro no Play na Quadra.
// O usuario precisa de um email unico, entao ganha um interno (dominio .invalid, que nunca recebe email nem faz login).

const DOMINIO_AVULSO = "avulso.playnaquadra.invalid";

export function gerarEmailAvulso() {
  return `avulso-${crypto.randomUUID()}@${DOMINIO_AVULSO}`;
}

export function ehEmailAvulso(email: string | null | undefined) {
  return String(email || "").trim().toLowerCase().endsWith(`@${DOMINIO_AVULSO}`);
}
