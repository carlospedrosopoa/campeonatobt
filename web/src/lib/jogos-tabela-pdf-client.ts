type PartidaTabelaPdf = {
  id: string;
  grupoNome: string | null;
  rodadaNome?: string | null;
  rodadaNumero?: number | null;
  arenaNome?: string | null;
  quadra?: string | null;
  dataHorario?: string | null;
  status: string;
  equipeAId: string;
  equipeANome: string | null;
  equipeBId: string;
  equipeBNome: string | null;
  detalhesPlacar: { set: number; a: number; b: number; tiebreak?: boolean; tbA?: number; tbB?: number }[] | null;
};

type CategoriaConfigTabelaPdf = {
  formato: "GRUPOS" | "MATA_MATA" | "LIGA";
  classificacao?: { porGrupo: number; melhoresTerceiros?: number };
  fase2?: { habilitada: boolean; temFinal: boolean };
};

type GrupoClassificacaoTabelaPdf = {
  grupoNome: string;
  equipes: {
    equipeId: string;
    equipeNome?: string;
    pontos: number;
    jogosVencidos?: number;
    saldoGames: number;
  }[];
};

type AbrirTabelaJogosPdfPorChavesParams = {
  torneioNome: string;
  categoriaNome: string;
  torneioBannerUrl?: string | null;
  partidas: PartidaTabelaPdf[];
  config?: CategoriaConfigTabelaPdf | null;
  classificacao?: GrupoClassificacaoTabelaPdf[];
  superCampeonato?: boolean;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDataHora(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPlacar(detalhes: PartidaTabelaPdf["detalhesPlacar"]) {
  if (!detalhes || detalhes.length === 0) return "-";
  return detalhes
    .slice()
    .sort((a, b) => a.set - b.set)
    .map((set) => {
      if (set.tiebreak && set.tbA !== undefined && set.tbB !== undefined) {
        return `${set.a}-${set.b} (${set.tbA}-${set.tbB})`;
      }
      return `${set.a}-${set.b}`;
    })
    .join(" ");
}

function faseParaQuantidade(quantidade: number) {
  if (quantidade <= 2) return "Final";
  if (quantidade === 4) return "Semifinais";
  if (quantidade === 8) return "Quartas de final";
  if (quantidade === 16) return "Oitavas de final";
  return "Mata-mata";
}

function montarSecaoEliminatorias(params: AbrirTabelaJogosPdfPorChavesParams) {
  const config = params.config;
  const grupos = (params.classificacao ?? [])
    .slice()
    .sort((a, b) => a.grupoNome.localeCompare(b.grupoNome, "pt-BR", { numeric: true, sensitivity: "base" }));

  if (!config || config.formato !== "GRUPOS") return "";
  if (config.fase2?.habilitada === false) return "";

  if (grupos.length === 1 && (config.fase2?.temFinal ?? true) === false) {
    return `
      <section class="eliminatorias">
        <div class="eliminatorias-topo">
          <h2>Como sera o mata-mata</h2>
        </div>
        <p class="eliminatorias-intro">
          Nesta categoria, a competicao termina na fase de grupos. Nao ha cruzamentos eliminatorios ate a final.
        </p>
      </section>
    `;
  }

  const porGrupo = config.classificacao?.porGrupo ?? 2;
  const melhoresTerceiros = config.classificacao?.melhoresTerceiros ?? 0;
  const totalClassificados = grupos.length * porGrupo + melhoresTerceiros;
  const rounds: { titulo: string; jogos: string[] }[] = [];
  const observacoes: string[] = [];

  if (params.superCampeonato) {
    rounds.push({
      titulo: "Quartas de final",
      jogos: ["J1: 3o colocado geral x 6o colocado geral", "J2: 4o colocado geral x 5o colocado geral"],
    });
    rounds.push({
      titulo: "Semifinais",
      jogos: ["SF1: 1o colocado geral x pior vencedor das quartas", "SF2: 2o colocado geral x melhor vencedor das quartas"],
    });
    rounds.push({
      titulo: "Final",
      jogos: ["F: vencedor da SF1 x vencedor da SF2"],
    });
    observacoes.push("Os 1o e 2o colocados gerais entram direto nas semifinais.");
    observacoes.push("A ordem das semifinais respeita a campanha da fase de grupos.");
  } else if (grupos.length === 1 && totalClassificados === 2) {
    rounds.push({
      titulo: "Final",
      jogos: ["F: 1o colocado geral x 2o colocado geral"],
    });
  } else if (totalClassificados === 6) {
    rounds.push({
      titulo: "Quartas de final",
      jogos: ["J1: S3 x S6", "J2: S4 x S5"],
    });
    rounds.push({
      titulo: "Semifinais",
      jogos: ["SF1: S1 x vencedor do J2", "SF2: S2 x vencedor do J1"],
    });
    rounds.push({
      titulo: "Final",
      jogos: ["F: vencedor da SF1 x vencedor da SF2"],
    });
    observacoes.push("S1 a S6 representam as sementes pela melhor campanha entre os classificados.");
  } else if (grupos.length === 2 && porGrupo >= 2 && totalClassificados === 4) {
    const g0 = grupos[0]?.grupoNome || "Grupo A";
    const g1 = grupos[1]?.grupoNome || "Grupo B";
    rounds.push({
      titulo: "Semifinais",
      jogos: [`SF1: 1o do ${g0} x 2o do ${g1}`, `SF2: 1o do ${g1} x 2o do ${g0}`],
    });
    rounds.push({
      titulo: "Final",
      jogos: ["F: vencedor da SF1 x vencedor da SF2"],
    });
  } else if (grupos.length === 4 && porGrupo >= 2 && totalClassificados === 8) {
    const g0 = grupos[0]?.grupoNome || "Grupo A";
    const g1 = grupos[1]?.grupoNome || "Grupo B";
    const g2 = grupos[2]?.grupoNome || "Grupo C";
    const g3 = grupos[3]?.grupoNome || "Grupo D";
    rounds.push({
      titulo: "Quartas de final",
      jogos: [
        `J1: 1o do ${g0} x 2o do ${g3}`,
        `J2: 1o do ${g1} x 2o do ${g2}`,
        `J3: 1o do ${g2} x 2o do ${g1}`,
        `J4: 1o do ${g3} x 2o do ${g0}`,
      ],
    });
    rounds.push({
      titulo: "Semifinais",
      jogos: ["SF1: vencedor do J1 x vencedor do J2", "SF2: vencedor do J3 x vencedor do J4"],
    });
    rounds.push({
      titulo: "Final",
      jogos: ["F: vencedor da SF1 x vencedor da SF2"],
    });
  } else if ([2, 4, 8, 16].includes(totalClassificados)) {
    const primeiraFase = faseParaQuantidade(totalClassificados);
    const jogosPrimeiraFase: string[] = [];
    for (let i = 1; i <= totalClassificados / 2; i += 1) {
      jogosPrimeiraFase.push(`J${i}: S${i} x S${totalClassificados + 1 - i}`);
    }
    rounds.push({ titulo: primeiraFase, jogos: jogosPrimeiraFase });
    if (totalClassificados >= 8) {
      rounds.push({
        titulo: "Semifinais",
        jogos: ["SF1: vencedor do J1 x vencedor do J2", `SF2: vencedor do J${totalClassificados / 2 - 1} x vencedor do J${totalClassificados / 2}`],
      });
      rounds.push({
        titulo: "Final",
        jogos: ["F: vencedor da SF1 x vencedor da SF2"],
      });
    } else if (totalClassificados === 4) {
      rounds.push({
        titulo: "Final",
        jogos: ["F: vencedor do J1 x vencedor do J2"],
      });
    }
    observacoes.push("S1, S2, S3... representam as sementes pela melhor campanha entre os classificados.");
  } else {
    observacoes.push("Os cruzamentos do mata-mata dependem da quantidade final de classificados desta categoria.");
  }

  if (melhoresTerceiros > 0) {
    observacoes.push(`Ha ${melhoresTerceiros} vaga(s) para melhores terceiros, definidos pela campanha na fase de grupos.`);
  }

  const roundsHtml = rounds
    .map(
      (round) => `
        <div class="eliminatoria-bloco">
          <div class="eliminatoria-titulo">${escapeHtml(round.titulo)}</div>
          <div class="eliminatoria-lista">
            ${round.jogos.map((jogo) => `<div class="eliminatoria-item">${escapeHtml(jogo)}</div>`).join("")}
          </div>
        </div>
      `
    )
    .join("");

  const observacoesHtml =
    observacoes.length > 0
      ? `
        <div class="eliminatoria-observacoes">
          ${observacoes.map((item) => `<div class="eliminatoria-observacao">${escapeHtml(item)}</div>`).join("")}
        </div>
      `
      : "";

  return `
    <section class="eliminatorias">
      <div class="eliminatorias-topo">
        <h2>Como sera o mata-mata</h2>
      </div>
      <p class="eliminatorias-intro">
        Abaixo esta a regra de cruzamentos das eliminatorias desta categoria, da entrada no mata-mata ate a final.
      </p>
      ${roundsHtml}
      ${observacoesHtml}
    </section>
  `;
}

export function abrirTabelaJogosPdfPorChaves(params: AbrirTabelaJogosPdfPorChavesParams) {
  const partidasPorChave = new Map<string, PartidaTabelaPdf[]>();

  for (const partida of params.partidas) {
    const chaveNome = (partida.grupoNome || "Sem chave").trim() || "Sem chave";
    const atuais = partidasPorChave.get(chaveNome) ?? [];
    atuais.push(partida);
    partidasPorChave.set(chaveNome, atuais);
  }

  const chaves = Array.from(partidasPorChave.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "pt-BR", { numeric: true, sensitivity: "base" }))
    .map(([chaveNome, partidas]) => ({
      chaveNome,
      partidas: partidas.sort((a, b) => {
        const rodadaA = a.rodadaNumero ?? Number.MAX_SAFE_INTEGER;
        const rodadaB = b.rodadaNumero ?? Number.MAX_SAFE_INTEGER;
        if (rodadaA !== rodadaB) return rodadaA - rodadaB;

        const dataA = a.dataHorario ? new Date(a.dataHorario).getTime() : Number.MAX_SAFE_INTEGER;
        const dataB = b.dataHorario ? new Date(b.dataHorario).getTime() : Number.MAX_SAFE_INTEGER;
        if (dataA !== dataB) return dataA - dataB;

        const nomeRodadaA = (a.rodadaNome || "").trim();
        const nomeRodadaB = (b.rodadaNome || "").trim();
        const cmpRodada = nomeRodadaA.localeCompare(nomeRodadaB, "pt-BR", { numeric: true, sensitivity: "base" });
        if (cmpRodada !== 0) return cmpRodada;

        return a.id.localeCompare(b.id);
      }),
    }));

  const bannerHtml = params.torneioBannerUrl
    ? `<div class="banner"><img src="/api/image-proxy?url=${encodeURIComponent(params.torneioBannerUrl)}" alt="Banner do torneio" /></div>`
    : "";
  const eliminatoriasHtml = montarSecaoEliminatorias(params);

  const chavesHtml = chaves
    .map((chave) => {
      const rowsHtml = chave.partidas
        .map((partida, index) => {
          const confronto = `${escapeHtml((partida.equipeANome || partida.equipeAId.slice(0, 8)).toString())} x ${escapeHtml(
            (partida.equipeBNome || partida.equipeBId.slice(0, 8)).toString()
          )}`;
          const rodada = escapeHtml((partida.rodadaNome || (partida.rodadaNumero ? `Rodada ${partida.rodadaNumero}` : "-")).toString());
          const dataHora = escapeHtml(formatDataHora(partida.dataHorario));
          const quadra = escapeHtml([partida.arenaNome || "", partida.quadra ? `Quadra ${partida.quadra}` : ""].filter(Boolean).join(" - ") || "-");
          const status = escapeHtml((partida.status || "-").toString());
          const placar = escapeHtml(formatPlacar(partida.detalhesPlacar));

          return `
            <tr class="${index % 2 === 0 ? "linha-par" : "linha-impar"}">
              <td>${rodada}</td>
              <td class="confronto">${confronto}</td>
              <td>${dataHora}</td>
              <td>${quadra}</td>
              <td>${status}</td>
              <td>${placar}</td>
            </tr>
          `;
        })
        .join("");

      return `
        <section class="chave-bloco">
          <div class="chave-topo">
            <h2>${escapeHtml(chave.chaveNome)}</h2>
            <span>${chave.partidas.length} jogo(s)</span>
          </div>
          <div class="tabela-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rodada</th>
                  <th>Confronto</th>
                  <th>Data/Hora</th>
                  <th>Quadra</th>
                  <th>Status</th>
                  <th>Placar</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
        </section>
      `;
    })
    .join("");

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Tabela de jogos - ${escapeHtml(params.categoriaNome)} - ${escapeHtml(params.torneioNome)}</title>
        <style>
          :root {
            color-scheme: light;
          }
          * {
            box-sizing: border-box;
          }
          body {
            margin: 0;
            background: #f8fafc;
            color: #0f172a;
            font-family: Arial, Helvetica, sans-serif;
          }
          .page {
            max-width: 1280px;
            margin: 0 auto;
            padding: 24px;
          }
          .actions {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            margin-bottom: 20px;
          }
          .button {
            border: 0;
            border-radius: 10px;
            padding: 12px 18px;
            font-size: 14px;
            font-weight: 700;
            cursor: pointer;
          }
          .button-primary {
            background: #0f172a;
            color: #ffffff;
          }
          .button-secondary {
            background: #ffffff;
            color: #334155;
            border: 1px solid #cbd5e1;
          }
          .sheet {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 20px;
            box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
            overflow: hidden;
          }
          .content {
            padding: 28px;
          }
          .banner {
            margin-bottom: 24px;
          }
          .banner img {
            width: 100%;
            height: auto;
            display: block;
            border-radius: 16px;
          }
          .eyebrow {
            color: #64748b;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.18em;
            text-transform: uppercase;
          }
          .title {
            margin: 8px 0 0;
            font-size: 30px;
            line-height: 1.15;
          }
          .meta {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            align-items: center;
            margin-top: 12px;
            color: #475569;
            font-size: 13px;
            font-weight: 600;
          }
          .badge {
            background: #0f172a;
            color: #ffffff;
            padding: 6px 10px;
            border-radius: 999px;
            font-size: 12px;
          }
          .chave-bloco {
            margin-top: 28px;
            page-break-inside: avoid;
          }
          .chave-topo {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            margin-bottom: 10px;
          }
          .chave-topo h2 {
            margin: 0;
            font-size: 15px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
          }
          .chave-topo span {
            color: #64748b;
            font-size: 12px;
            font-weight: 700;
          }
          .tabela-wrap {
            overflow: hidden;
            border: 1px solid #e2e8f0;
            border-radius: 16px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          thead {
            background: #f1f5f9;
          }
          th, td {
            padding: 12px 14px;
            text-align: left;
            vertical-align: top;
            border-bottom: 1px solid #e2e8f0;
            font-size: 12px;
          }
          th {
            color: #64748b;
            font-size: 10px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }
          tbody tr:last-child td {
            border-bottom: 0;
          }
          .linha-par {
            background: #ffffff;
          }
          .linha-impar {
            background: #f8fafc;
          }
          .confronto {
            font-weight: 700;
            color: #0f172a;
          }
          .eliminatorias {
            margin-top: 32px;
            border-top: 1px solid #e2e8f0;
            padding-top: 24px;
            page-break-inside: avoid;
          }
          .eliminatorias-topo h2 {
            margin: 0;
            font-size: 18px;
          }
          .eliminatorias-intro {
            margin: 10px 0 0;
            color: #475569;
            font-size: 13px;
            line-height: 1.6;
          }
          .eliminatoria-bloco {
            margin-top: 18px;
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            overflow: hidden;
          }
          .eliminatoria-titulo {
            background: #f8fafc;
            padding: 12px 14px;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: #475569;
            border-bottom: 1px solid #e2e8f0;
          }
          .eliminatoria-lista {
            padding: 12px 14px;
          }
          .eliminatoria-item {
            font-size: 13px;
            color: #0f172a;
            font-weight: 700;
            padding: 7px 0;
            border-bottom: 1px solid #f1f5f9;
          }
          .eliminatoria-item:last-child {
            border-bottom: 0;
          }
          .eliminatoria-observacoes {
            margin-top: 14px;
            padding: 14px;
            border-radius: 14px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
          }
          .eliminatoria-observacao {
            color: #475569;
            font-size: 12px;
            line-height: 1.6;
          }
          .eliminatoria-observacao + .eliminatoria-observacao {
            margin-top: 6px;
          }
          .footer {
            margin-top: 28px;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
            color: #94a3b8;
            font-size: 12px;
            font-weight: 700;
            text-align: center;
          }
          @media print {
            body {
              background: #ffffff;
            }
            .actions {
              display: none;
            }
            .page {
              max-width: none;
              padding: 0;
            }
            .sheet {
              border: 0;
              border-radius: 0;
              box-shadow: none;
            }
            .content {
              padding: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="actions">
            <button class="button button-secondary" onclick="window.close()">Fechar</button>
            <button class="button button-primary" onclick="window.print()">Salvar em PDF / Imprimir</button>
          </div>
          <div class="sheet">
            <div class="content">
              ${bannerHtml}
              <div class="eyebrow">Play Na Quadra</div>
              <h1 class="title">${escapeHtml(params.torneioNome)}</h1>
              <div class="meta">
                <span class="badge">${escapeHtml(params.categoriaNome)}</span>
                <span>Tabela de jogos por chave</span>
                <span>${new Date().toLocaleDateString("pt-BR")}</span>
              </div>
              ${chavesHtml}
              ${eliminatoriasHtml}
              <div class="footer">Gerado por Play Na Quadra</div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  const win = window.open("", "_blank");
  if (!win) {
    throw new Error("Nao foi possivel abrir a visualizacao do PDF");
  }

  win.document.write(htmlContent);
  win.document.close();
}
