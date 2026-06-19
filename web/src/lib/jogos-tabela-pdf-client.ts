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

type AbrirTabelaJogosPdfPorChavesParams = {
  torneioNome: string;
  categoriaNome: string;
  torneioBannerUrl?: string | null;
  partidas: PartidaTabelaPdf[];
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
