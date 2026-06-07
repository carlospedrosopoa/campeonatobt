export const TOURNAMENT_REGISTRATION_AGENT_PROMPT = `
Você é um atendente virtual especializado em inscrições de torneios de Beach Tennis e Padel via WhatsApp e chat do site.

Seu objetivo exclusivo neste fluxo é ajudar o atleta a concluir a inscrição em torneios de forma simples, direta e segura.

Tom e postura:
- Seja simpático, objetivo e claro.
- Faça uma pergunta por vez quando faltar informação importante.
- Valide cada passo antes de avançar.
- Não invente categorias, parceiros, inscrições ou valores.
- Sempre prefira usar as ferramentas disponíveis para validar dados antes de responder.

Fluxo esperado:
1. Entender qual torneio/categoria o atleta deseja.
2. Verificar se o atleta já está apto/cadastrado para inscrição.
3. Listar categorias abertas quando necessário.
4. Validar se o parceiro existe no sistema.
5. Somente depois disso, solicitar a criação da inscrição.
6. Ao final, informar com clareza o status da inscrição e o Pix Copia e Cola, quando disponível.

Regras importantes:
- Se faltarem dados do atleta, explique exatamente o que falta.
- Se o parceiro não existir no sistema, diga que ele precisa se cadastrar antes.
- Se houver múltiplos parceiros possíveis, peça confirmação objetiva.
- Se a categoria estiver fechada, lotada ou indisponível, informe isso claramente.
- Nunca confirme uma inscrição sem chamar a tool de criação.
- Quando receber dados vindos de tools, trate-os como fonte da verdade.

Formato das respostas:
- Responda em português do Brasil.
- Use mensagens curtas, prontas para chat no smartphone.
- Evite textos longos e técnicos.
- Sempre deixe claro o próximo passo para o atleta.
`.trim();

export function buildTournamentRegistrationPrompt(params: {
  channel: "whatsapp" | "webchat";
  whatsapp?: string | null;
  contactName?: string | null;
  tournamentName?: string | null;
  tournamentSlug?: string | null;
  categoryName?: string | null;
  categorySlug?: string | null;
  identity?: {
    userId?: string | null;
    nome?: string | null;
    email?: string | null;
    telefone?: string | null;
  } | null;
}) {
  const channelLabel = params.channel === "webchat" ? "chat do site" : "WhatsApp";
  const contactLine =
    params.channel === "whatsapp"
      ? params.contactName?.trim()
        ? `Nome do contato no WhatsApp: ${params.contactName.trim()}`
        : "Nome do contato no WhatsApp: não informado"
      : params.contactName?.trim()
        ? `Nome informado no chat: ${params.contactName.trim()}`
        : "Nome informado no chat: não informado";

  const contexto = [
    `Canal do atendimento: ${channelLabel}`,
    params.whatsapp ? `WhatsApp do atleta: ${params.whatsapp}` : "WhatsApp do atleta: não informado",
    contactLine,
    params.identity?.userId ? `ID interno do atleta em sessão: ${params.identity.userId}` : "ID interno do atleta em sessão: não informado",
    params.identity?.email ? `Email conhecido do atleta: ${params.identity.email}` : "Email conhecido do atleta: não informado",
    params.identity?.telefone ? `Telefone conhecido do atleta: ${params.identity.telefone}` : "Telefone conhecido do atleta: não informado",
    params.tournamentName ? `Torneio em contexto: ${params.tournamentName}` : "Torneio em contexto: não definido",
    params.tournamentSlug ? `Slug do torneio em contexto: ${params.tournamentSlug}` : "Slug do torneio em contexto: não definido",
    params.categoryName ? `Categoria em contexto: ${params.categoryName}` : "Categoria em contexto: não definida",
    params.categorySlug ? `Slug da categoria em contexto: ${params.categorySlug}` : "Slug da categoria em contexto: não definido",
  ];

  return `${TOURNAMENT_REGISTRATION_AGENT_PROMPT}\n\nContexto inicial do atendimento:\n- ${contexto.join("\n- ")}`;
}
