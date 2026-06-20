"use client";

type CategoriaConfigContingencia = {
  regrasPartida?: {
    melhorDe?: 1 | 3;
    gamesPorSet?: 4 | 5 | 6;
    incluirSuperTieEmGames?: boolean;
    superTiebreakDecisivo?: { habilitado?: boolean; ate?: number };
  };
};

type PartidaContingencia = {
  id: string;
  rodadaNome?: string | null;
  rodadaNumero?: number | null;
  grupoNome: string | null;
  equipeANome: string | null;
  equipeAId: string;
  equipeBNome: string | null;
  equipeBId: string;
  placarA?: number | null;
  placarB?: number | null;
  detalhesPlacar: { set: number; a: number; b: number; tiebreak?: boolean; tbA?: number; tbB?: number }[] | null;
};

type GrupoClassificacaoContingencia = {
  grupoNome: string;
  equipes: {
    equipeId: string;
    equipeNome?: string;
    pontos: number;
    jogosJogados: number;
    jogosVencidos: number;
    jogosPerdidos: number;
    saldoGames: number;
    gamesPro?: number;
    setsPro?: number;
  }[];
};

type ExportarPlanilhaContingenciaParams = {
  torneioNome: string;
  categoriaNome: string;
  torneioSlug?: string;
  categoriaSlug?: string;
  config?: CategoriaConfigContingencia | null;
  partidas: PartidaContingencia[];
  classificacao?: GrupoClassificacaoContingencia[];
  superCampeonato?: boolean;
};

type GrupoContingencia = {
  grupoNome: string;
  partidas: (PartidaContingencia & {
    equipeAExibicao: string;
    equipeBExibicao: string;
    setsAInicial: number | string;
    setsBInicial: number | string;
    gamesAInicial: number | string;
    gamesBInicial: number | string;
  })[];
  equipes: string[];
};

function normalizarNomeAba(value: string) {
  const nome = (value || "Grupo").replaceAll(/[\\/?*[\]:]/g, " ").trim();
  return (nome || "Grupo").slice(0, 31);
}

function nomeArquivoSeguro(value: string) {
  return (value || "contingencia")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function colunaExcel(index: number) {
  let n = index + 1;
  let resultado = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    resultado = String.fromCharCode(65 + resto) + resultado;
    n = Math.floor((n - 1) / 26);
  }
  return resultado;
}

function celula(coluna: number, linha: number) {
  return `${colunaExcel(coluna)}${linha}`;
}

function ordenarPartidas(a: PartidaContingencia, b: PartidaContingencia) {
  const rodadaA = a.rodadaNumero ?? Number.MAX_SAFE_INTEGER;
  const rodadaB = b.rodadaNumero ?? Number.MAX_SAFE_INTEGER;
  if (rodadaA !== rodadaB) return rodadaA - rodadaB;

  const nomeRodadaA = (a.rodadaNome || "").trim();
  const nomeRodadaB = (b.rodadaNome || "").trim();
  const cmpRodada = nomeRodadaA.localeCompare(nomeRodadaB, "pt-BR", { numeric: true, sensitivity: "base" });
  if (cmpRodada !== 0) return cmpRodada;

  return a.id.localeCompare(b.id);
}

function computeGames(
  detalhes: PartidaContingencia["detalhesPlacar"],
  opts?: { ignoreSuperTieMin?: number | null }
) {
  if (!detalhes || detalhes.length === 0) return null;
  let a = 0;
  let b = 0;
  for (const set of detalhes) {
    const ignoreMin = opts?.ignoreSuperTieMin ?? null;
    if (ignoreMin && set?.tiebreak) {
      const maior = Math.max(Number(set.a) || 0, Number(set.b) || 0);
      if (maior >= ignoreMin) continue;
    }
    a += Number(set.a) || 0;
    b += Number(set.b) || 0;
  }
  return { a, b };
}

function criarNomeAbaUnico(nomeBase: string, existentes: Set<string>) {
  const base = normalizarNomeAba(nomeBase) || "Grupo";
  if (!existentes.has(base)) {
    existentes.add(base);
    return base;
  }

  let contador = 2;
  while (contador < 100) {
    const sufixo = ` ${contador}`;
    const candidato = `${base.slice(0, Math.max(1, 31 - sufixo.length))}${sufixo}`;
    if (!existentes.has(candidato)) {
      existentes.add(candidato);
      return candidato;
    }
    contador += 1;
  }

  const fallback = `${base.slice(0, 28)} XXX`;
  existentes.add(fallback);
  return fallback;
}

function obterEquipesGrupo(
  grupoNome: string,
  partidas: PartidaContingencia[],
  classificacaoMap: Map<string, GrupoClassificacaoContingencia>
) {
  const doRanking = classificacaoMap.get(grupoNome)?.equipes?.map((e) => (e.equipeNome || e.equipeId).trim()).filter(Boolean) ?? [];
  if (doRanking.length > 0) return Array.from(new Set(doRanking));

  const equipes = new Set<string>();
  for (const partida of partidas) {
    equipes.add((partida.equipeANome || partida.equipeAId.slice(0, 8)).trim());
    equipes.add((partida.equipeBNome || partida.equipeBId.slice(0, 8)).trim());
  }
  return Array.from(equipes).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
}

function montarGrupos(params: ExportarPlanilhaContingenciaParams) {
  const porGrupo = new Map<string, PartidaContingencia[]>();
  const classificacaoMap = new Map((params.classificacao ?? []).map((grupo) => [grupo.grupoNome, grupo]));
  const ignoreSuperTieMin =
    params.superCampeonato
      ? (params.config?.regrasPartida?.superTiebreakDecisivo?.ate ?? 10)
      : params.config?.regrasPartida?.superTiebreakDecisivo?.habilitado && params.config?.regrasPartida?.incluirSuperTieEmGames !== true
        ? (params.config?.regrasPartida?.superTiebreakDecisivo?.ate ?? 10)
        : null;

  for (const partida of params.partidas) {
    const grupoNome = (partida.grupoNome || "Sem grupo").trim() || "Sem grupo";
    const atuais = porGrupo.get(grupoNome) ?? [];
    atuais.push(partida);
    porGrupo.set(grupoNome, atuais);
  }

  return Array.from(porGrupo.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "pt-BR", { numeric: true, sensitivity: "base" }))
    .map(([grupoNome, partidas]) => {
      const partidasOrdenadas = partidas.slice().sort(ordenarPartidas);
      const equipes = obterEquipesGrupo(grupoNome, partidasOrdenadas, classificacaoMap);

      return {
        grupoNome,
        equipes,
        partidas: partidasOrdenadas.map((partida) => {
          const games = computeGames(partida.detalhesPlacar, { ignoreSuperTieMin });
          return {
            ...partida,
            equipeAExibicao: (partida.equipeANome || partida.equipeAId.slice(0, 8)).trim(),
            equipeBExibicao: (partida.equipeBNome || partida.equipeBId.slice(0, 8)).trim(),
            setsAInicial: partida.placarA ?? "",
            setsBInicial: partida.placarB ?? "",
            gamesAInicial: games?.a ?? "",
            gamesBInicial: games?.b ?? "",
          };
        }),
      } satisfies GrupoContingencia;
    });
}

function adicionarAbaInstrucoes(
  XLSX: typeof import("xlsx"),
  wb: import("xlsx").WorkBook,
  grupos: GrupoContingencia[],
  params: ExportarPlanilhaContingenciaParams
) {
  const modoClassificacao = params.superCampeonato
    ? "Pontos > Vitorias > Sets Pro > Saldo de Games > ordem da planilha"
    : "Vitorias > Saldo de Games > Confronto Direto (empate entre 2) > Games Pro > ordem da planilha";

  const observacaoSuperTie =
    params.config?.regrasPartida?.superTiebreakDecisivo?.habilitado && params.config?.regrasPartida?.incluirSuperTieEmGames !== true
      ? "Se houver super tie decisivo, preencha Games A/B sem os pontos do super tie."
      : "Games A/B devem refletir os games validos da partida conforme o torneio.";

  const linhas: (string | number)[][] = [
    ["Planilha de contingencia offline"],
    [params.torneioNome],
    [`Categoria: ${params.categoriaNome}`],
    [""],
    ["Como usar"],
    ["1. Cada aba de grupo permite lancar os resultados das partidas daquela chave."],
    ["2. Preencha somente as colunas Sets A, Sets B, Games A e Games B."],
    ["3. As colunas Jogado, Vencedor, pontos e classificacao sao automaticas."],
    ["4. Em caso de empate final sem criterio resolvido, a ordem da planilha serve como desempate manual."],
    [observacaoSuperTie],
    [""],
    ["Criterio da classificacao"],
    [modoClassificacao],
    [""],
    ["Resumo das abas"],
    ["Grupo", "Equipes", "Jogos"],
    ...grupos.map((grupo) => [grupo.grupoNome, grupo.equipes.length, grupo.partidas.length]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(linhas);
  ws["!cols"] = [{ wch: 42 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws, "Instrucoes");
}

function formulaPontosA(superCampeonato: boolean, linha: number) {
  if (!superCampeonato) {
    return `IF(H${linha}=0,0,IF(D${linha}>E${linha},1,0))`;
  }
  return `IF(H${linha}=0,0,IF(D${linha}>E${linha},IF(AND(D${linha}=2,E${linha}=1),2,3),IF(E${linha}>D${linha},IF(AND(E${linha}=2,D${linha}=1),1,0),0)))`;
}

function formulaPontosB(superCampeonato: boolean, linha: number) {
  if (!superCampeonato) {
    return `IF(H${linha}=0,0,IF(E${linha}>D${linha},1,0))`;
  }
  return `IF(H${linha}=0,0,IF(E${linha}>D${linha},IF(AND(E${linha}=2,D${linha}=1),2,3),IF(D${linha}>E${linha},IF(AND(D${linha}=2,E${linha}=1),1,0),0)))`;
}

function adicionarAbaGrupo(
  XLSX: typeof import("xlsx"),
  wb: import("xlsx").WorkBook,
  grupo: GrupoContingencia,
  nomeAba: string,
  params: ExportarPlanilhaContingenciaParams
) {
  const linhas: (string | number)[][] = [];
  linhas.push([params.torneioNome]);
  linhas.push([params.categoriaNome]);
  linhas.push([grupo.grupoNome]);
  linhas.push(["Preencha Sets A, Sets B, Games A e Games B para cada jogo."]);
  linhas.push([]);
  linhas.push(["Jogos"]);
  linhas.push(["Rodada", "Equipe A", "Equipe B", "Sets A", "Sets B", "Games A", "Games B", "Jogado", "Vencedor", "Obs.", "Pontos A", "Pontos B"]);

  for (const partida of grupo.partidas) {
    linhas.push([
      partida.rodadaNome || (partida.rodadaNumero ? `Rodada ${partida.rodadaNumero}` : "-"),
      partida.equipeAExibicao,
      partida.equipeBExibicao,
      partida.setsAInicial,
      partida.setsBInicial,
      partida.gamesAInicial,
      partida.gamesBInicial,
      "",
      "",
      "",
      "",
      "",
    ]);
  }

  linhas.push([]);
  linhas.push(["Classificacao"]);

  const superCampeonato = Boolean(params.superCampeonato);
  const cabecalhoClassificacao = superCampeonato
    ? ["Equipe", "J", "P", "V", "D", "SP", "GP", "GC", "SG", "Pos", "Ordem"]
    : ["Equipe", "J", "V", "D", "GP", "GC", "SG", "CD", "Pos", "Empate com", "Ordem"];

  linhas.push(cabecalhoClassificacao);

  for (const equipe of grupo.equipes) {
    linhas.push([equipe]);
  }

  const ws = XLSX.utils.aoa_to_sheet(linhas);
  const jogoInicio = 8;
  const jogoFim = jogoInicio + grupo.partidas.length - 1;
  const classificacaoCabecalho = jogoFim + 3;
  const classificacaoInicio = classificacaoCabecalho + 1;
  const classificacaoFim = classificacaoInicio + grupo.equipes.length - 1;

  for (let linha = jogoInicio; linha <= jogoFim; linha += 1) {
    ws[celula(7, linha)] = { f: `IF(AND(D${linha}<>"",E${linha}<>"",F${linha}<>"",G${linha}<>""),1,0)` };
    ws[celula(8, linha)] = { f: `IF(H${linha}=0,"",IF(D${linha}>E${linha},B${linha},IF(E${linha}>D${linha},C${linha},"")))` };
    ws[celula(10, linha)] = { f: formulaPontosA(superCampeonato, linha) };
    ws[celula(11, linha)] = { f: formulaPontosB(superCampeonato, linha) };
  }

  for (let linha = classificacaoInicio; linha <= classificacaoFim; linha += 1) {
    const equipeCell = celula(0, linha);

    if (superCampeonato) {
      ws[celula(1, linha)] = {
        f: `SUMPRODUCT(--($B$${jogoInicio}:$B$${jogoFim}=${equipeCell}),$H$${jogoInicio}:$H$${jogoFim})+SUMPRODUCT(--($C$${jogoInicio}:$C$${jogoFim}=${equipeCell}),$H$${jogoInicio}:$H$${jogoFim})`,
      };
      ws[celula(2, linha)] = {
        f: `SUMIFS($K$${jogoInicio}:$K$${jogoFim},$B$${jogoInicio}:$B$${jogoFim},${equipeCell},$H$${jogoInicio}:$H$${jogoFim},1)+SUMIFS($L$${jogoInicio}:$L$${jogoFim},$C$${jogoInicio}:$C$${jogoFim},${equipeCell},$H$${jogoInicio}:$H$${jogoFim},1)`,
      };
      ws[celula(3, linha)] = { f: `COUNTIF($I$${jogoInicio}:$I$${jogoFim},${equipeCell})` };
      ws[celula(4, linha)] = { f: `B${linha}-D${linha}` };
      ws[celula(5, linha)] = {
        f: `SUMIFS($D$${jogoInicio}:$D$${jogoFim},$B$${jogoInicio}:$B$${jogoFim},${equipeCell},$H$${jogoInicio}:$H$${jogoFim},1)+SUMIFS($E$${jogoInicio}:$E$${jogoFim},$C$${jogoInicio}:$C$${jogoFim},${equipeCell},$H$${jogoInicio}:$H$${jogoFim},1)`,
      };
      ws[celula(6, linha)] = {
        f: `SUMIFS($F$${jogoInicio}:$F$${jogoFim},$B$${jogoInicio}:$B$${jogoFim},${equipeCell},$H$${jogoInicio}:$H$${jogoFim},1)+SUMIFS($G$${jogoInicio}:$G$${jogoFim},$C$${jogoInicio}:$C$${jogoFim},${equipeCell},$H$${jogoInicio}:$H$${jogoFim},1)`,
      };
      ws[celula(7, linha)] = {
        f: `SUMIFS($G$${jogoInicio}:$G$${jogoFim},$B$${jogoInicio}:$B$${jogoFim},${equipeCell},$H$${jogoInicio}:$H$${jogoFim},1)+SUMIFS($F$${jogoInicio}:$F$${jogoFim},$C$${jogoInicio}:$C$${jogoFim},${equipeCell},$H$${jogoInicio}:$H$${jogoFim},1)`,
      };
      ws[celula(8, linha)] = { f: `G${linha}-H${linha}` };
      ws[celula(10, linha)] = { f: `C${linha}*1000000000+D${linha}*1000000+F${linha}*10000+I${linha}` };
      ws[celula(9, linha)] = {
        f: `1+SUMPRODUCT(--($K$${classificacaoInicio}:$K$${classificacaoFim}>K${linha}))+SUMPRODUCT(--($K$${classificacaoInicio}:$K$${classificacaoFim}=K${linha}),--(ROW($K$${classificacaoInicio}:$K$${classificacaoFim})<ROW(K${linha})))`,
      };
    } else {
      ws[celula(1, linha)] = {
        f: `SUMPRODUCT(--($B$${jogoInicio}:$B$${jogoFim}=${equipeCell}),$H$${jogoInicio}:$H$${jogoFim})+SUMPRODUCT(--($C$${jogoInicio}:$C$${jogoFim}=${equipeCell}),$H$${jogoInicio}:$H$${jogoFim})`,
      };
      ws[celula(2, linha)] = { f: `COUNTIF($I$${jogoInicio}:$I$${jogoFim},${equipeCell})` };
      ws[celula(3, linha)] = { f: `B${linha}-C${linha}` };
      ws[celula(4, linha)] = {
        f: `SUMIFS($F$${jogoInicio}:$F$${jogoFim},$B$${jogoInicio}:$B$${jogoFim},${equipeCell},$H$${jogoInicio}:$H$${jogoFim},1)+SUMIFS($G$${jogoInicio}:$G$${jogoFim},$C$${jogoInicio}:$C$${jogoFim},${equipeCell},$H$${jogoInicio}:$H$${jogoFim},1)`,
      };
      ws[celula(5, linha)] = {
        f: `SUMIFS($G$${jogoInicio}:$G$${jogoFim},$B$${jogoInicio}:$B$${jogoFim},${equipeCell},$H$${jogoInicio}:$H$${jogoFim},1)+SUMIFS($F$${jogoInicio}:$F$${jogoFim},$C$${jogoInicio}:$C$${jogoFim},${equipeCell},$H$${jogoInicio}:$H$${jogoFim},1)`,
      };
      ws[celula(6, linha)] = { f: `E${linha}-F${linha}` };
      ws[celula(9, linha)] = {
        f: `IF(COUNTIFS($C$${classificacaoInicio}:$C$${classificacaoFim},C${linha},$G$${classificacaoInicio}:$G$${classificacaoFim},G${linha},$E$${classificacaoInicio}:$E$${classificacaoFim},E${linha})=2,INDEX($A$${classificacaoInicio}:$A$${classificacaoFim},SUMPRODUCT((ROW($A$${classificacaoInicio}:$A$${classificacaoFim})-ROW($A$${classificacaoInicio})+1)*($A$${classificacaoInicio}:$A$${classificacaoFim}<>${equipeCell})*($C$${classificacaoInicio}:$C$${classificacaoFim}=C${linha})*($G$${classificacaoInicio}:$G$${classificacaoFim}=G${linha})*($E$${classificacaoInicio}:$E$${classificacaoFim}=E${linha}))),"")`,
      };
      ws[celula(7, linha)] = {
        f: `IF(J${linha}="",0,SUMPRODUCT(($H$${jogoInicio}:$H$${jogoFim}=1)*((($B$${jogoInicio}:$B$${jogoFim}=${equipeCell})*($C$${jogoInicio}:$C$${jogoFim}=J${linha}))+(($C$${jogoInicio}:$C$${jogoFim}=${equipeCell})*($B$${jogoInicio}:$B$${jogoFim}=J${linha})))*($I$${jogoInicio}:$I$${jogoFim}=${equipeCell})))`,
      };
      ws[celula(10, linha)] = { f: `C${linha}*1000000000+(G${linha}+10000)*100000+H${linha}*1000+E${linha}` };
      ws[celula(8, linha)] = {
        f: `1+SUMPRODUCT(--($K$${classificacaoInicio}:$K$${classificacaoFim}>K${linha}))+SUMPRODUCT(--($K$${classificacaoInicio}:$K$${classificacaoFim}=K${linha}),--(ROW($K$${classificacaoInicio}:$K$${classificacaoFim})<ROW(K${linha})))`,
      };
    }
  }

  ws["!cols"] = superCampeonato
    ? [
        { wch: 16 },
        { wch: 24 },
        { wch: 24 },
        { wch: 8 },
        { wch: 8 },
        { wch: 9 },
        { wch: 9 },
        { wch: 8 },
        { wch: 22 },
        { wch: 12 },
        { wch: 10, hidden: true },
        { wch: 10, hidden: true },
      ]
    : [
        { wch: 16 },
        { wch: 24 },
        { wch: 24 },
        { wch: 8 },
        { wch: 8 },
        { wch: 9 },
        { wch: 9 },
        { wch: 8 },
        { wch: 22 },
        { wch: 14 },
        { wch: 10, hidden: true },
        { wch: 10, hidden: true },
      ];

  XLSX.utils.book_append_sheet(wb, ws, nomeAba);
}

export async function exportarPlanilhaContingenciaCategoria(params: ExportarPlanilhaContingenciaParams) {
  const grupos = montarGrupos(params);
  if (grupos.length === 0) {
    throw new Error("Nenhum jogo de grupos encontrado para gerar a planilha.");
  }

  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  adicionarAbaInstrucoes(XLSX, wb, grupos, params);

  const abasExistentes = new Set<string>(["Instrucoes"]);
  for (const grupo of grupos) {
    const nomeAba = criarNomeAbaUnico(grupo.grupoNome, abasExistentes);
    adicionarAbaGrupo(XLSX, wb, grupo, nomeAba, params);
  }

  const arquivo = [
    "contingencia",
    nomeArquivoSeguro(params.torneioSlug || params.torneioNome),
    nomeArquivoSeguro(params.categoriaSlug || params.categoriaNome),
  ]
    .filter(Boolean)
    .join("-");

  XLSX.writeFile(wb, `${arquivo || "contingencia-categoria"}.xlsx`);
}
