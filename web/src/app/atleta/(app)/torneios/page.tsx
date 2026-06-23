"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Calendar, MapPin, Trophy, X } from "lucide-react";
import { useSearchParams } from "next/navigation";

type Torneio = {
  id: string;
  nome: string;
  slug: string;
  descricao: string | null;
  dataInicio: string;
  dataFim: string;
  local: string;
  status: string;
  bannerUrl: string | null;
  logoUrl: string | null;
  superCampeonato: boolean;
  valorPrimeiraInscricao?: string | null;
  valorInscricaoAdicional?: string | null;
  camisetaOpcoes?: string[] | null;
  esporteNome: string | null;
  categorias: {
    id: string;
    nome: string;
    slug: string;
    genero: string;
    valorInscricao: string | null;
    vagasMaximas: number | null;
    dataHorario: string | null;
    inscritos: number;
    inscricoesAbertas?: boolean;
  }[];
};

type Inscricao = {
  id: string;
  status: string;
  dataInscricao: string;
  torneio: { id: string; nome: string; slug: string; temJogosEmAndamento?: boolean };
  categoria: { id: string; nome: string; slug: string; valorInscricao: string | null };
  torneioPix: { chave: string | null; nome: string | null; cidade: string | null };
  meuPagamento: { pago: boolean; status?: string | null; valorDevido: string | null };
  medalha?: "OURO" | "PRATA" | null;
  torneioCamisetaOpcoes?: string[] | null;
  minhaCamisetaOpcao?: string | null;
  equipe: { id: string; nome: string | null; atletas: { id: string; nome: string; email: string; telefone: string | null }[] };
};

type ParceiroBusca = {
  id: string;
  playnaquadraAtletaId?: string | null;
  nome: string;
  telefone?: string | null;
  fotoUrl?: string | null;
  email?: string | null;
};

function formatDateRange(ini?: string | null, fim?: string | null) {
  const d1 = ini ? new Date(ini) : null;
  const d2 = fim ? new Date(fim) : null;
  if (!d1 || Number.isNaN(d1.getTime()) || !d2 || Number.isNaN(d2.getTime())) return null;
  const a = d1.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
  const b = d2.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
  return `${a}–${b}`;
}

function formatDataHora(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const data = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
  const hora = d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  return `${data} ${hora}`;
}

function statusBadge(status: string) {
  const base = "inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold";
  if (status === "ABERTO") return <span className={`${base} bg-emerald-100 text-emerald-700`}>Aberto</span>;
  if (status === "EM_ANDAMENTO") return <span className={`${base} bg-blue-100 text-blue-700`}>Em andamento</span>;
  return <span className={`${base} bg-gray-100 text-gray-700`}>{status}</span>;
}

function getInitials(nome: string) {
  const parts = (nome || "").trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase();
}

function medalhaBadge(tipo?: "OURO" | "PRATA" | null) {
  if (tipo === "OURO") {
    return <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">Ouro</span>;
  }
  if (tipo === "PRATA") {
    return <span className="inline-flex items-center rounded-full bg-slate-200 px-2 py-1 text-xs font-bold text-slate-700">Prata</span>;
  }
  return null;
}

export default function AtletaTorneiosPage() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"torneios" | "inscricoes">("inscricoes");
  const [torneioSlugFiltro, setTorneioSlugFiltro] = useState<string | null>(null);

  const [torneios, setTorneios] = useState<Torneio[]>([]);
  const [carregandoTorneios, setCarregandoTorneios] = useState(true);
  const [erroTorneios, setErroTorneios] = useState<string | null>(null);
  const [flashOk, setFlashOk] = useState<string | null>(null);

  const [inscricoes, setInscricoes] = useState<Inscricao[]>([]);
  const [carregandoInscricoes, setCarregandoInscricoes] = useState(false);
  const [erroInscricoes, setErroInscricoes] = useState<string | null>(null);

  const [modalCategoria, setModalCategoria] = useState<{ torneio: Torneio; categoriaId: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [equipeNome, setEquipeNome] = useState("");
  const [buscaParceiro, setBuscaParceiro] = useState("");
  const [parceiros, setParceiros] = useState<ParceiroBusca[]>([]);
  const [carregandoParceiros, setCarregandoParceiros] = useState(false);
  const [parceiroSelecionado, setParceiroSelecionado] = useState<ParceiroBusca | null>(null);
  const [erroModal, setErroModal] = useState<string | null>(null);
  const [camisetaOpcoes, setCamisetaOpcoes] = useState<string[]>([]);
  const [camisetaSelecionada, setCamisetaSelecionada] = useState("");
  const [camisetaCarregando, setCamisetaCarregando] = useState(false);
  const [camisetaErro, setCamisetaErro] = useState<string | null>(null);

  const [camisetaEditar, setCamisetaEditar] = useState<{
    torneioId: string;
    torneioNome: string;
    opcoes: string[];
    selecionada: string;
  } | null>(null);
  const [camisetaSalvando, setCamisetaSalvando] = useState(false);
  const [inscricaoEditar, setInscricaoEditar] = useState<{
    inscricaoId: string;
    torneioId: string;
    torneioNome: string;
    categoriaNome: string;
    equipeNome: string;
  } | null>(null);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [cancelandoInscricaoId, setCancelandoInscricaoId] = useState<string | null>(null);
  const [buscaParceiroEditar, setBuscaParceiroEditar] = useState("");
  const [parceirosEditar, setParceirosEditar] = useState<ParceiroBusca[]>([]);
  const [carregandoParceirosEditar, setCarregandoParceirosEditar] = useState(false);
  const [parceiroSelecionadoEditar, setParceiroSelecionadoEditar] = useState<ParceiroBusca | null>(null);
  const [erroEditar, setErroEditar] = useState<string | null>(null);

  const [pixModal, setPixModal] = useState<{
    inscricaoId: string;
    torneioNome: string;
    categoriaNome: string;
    valor: string | null;
    payload: string;
    svg: string;
    pago: boolean;
    status: string;
  } | null>(null);
  const [pixCarregando, setPixCarregando] = useState(false);
  const [pixErro, setPixErro] = useState<string | null>(null);

  useEffect(() => {
    const slug = searchParams.get("torneioSlug");
    if (!slug) return;
    setTorneioSlugFiltro(slug);
    setTab("torneios");
  }, [searchParams]);

  async function abrirPix(params: { inscricaoId: string; torneioNome: string; categoriaNome: string }) {
    try {
      setPixErro(null);
      setPixCarregando(true);
      setPixModal({
        inscricaoId: params.inscricaoId,
        torneioNome: params.torneioNome,
        categoriaNome: params.categoriaNome,
        valor: null,
        payload: "",
        svg: "",
        pago: false,
        status: "PENDENTE",
      });

      const res = await fetch(`/api/v1/atleta/inscricoes/${params.inscricaoId}/pix`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(data?.error || "Falha ao gerar PIX");

      setPixModal({
        inscricaoId: params.inscricaoId,
        torneioNome: params.torneioNome,
        categoriaNome: params.categoriaNome,
        valor: (data?.valor as string | null) ?? null,
        payload: String(data?.payload || ""),
        svg: String(data?.svg || ""),
        pago: Boolean(data?.pago),
        status: String(data?.status || (data?.pago ? "PAGO" : "PENDENTE")),
      });
    } catch (e: any) {
      setPixErro(e?.message || "Erro ao gerar PIX");
      setPixModal(null);
    } finally {
      setPixCarregando(false);
    }
  }

  async function abrirPixTotal(params: { torneioId: string; torneioNome: string }) {
    try {
      setPixErro(null);
      setPixCarregando(true);
      setPixModal({
        inscricaoId: `TOTAL:${params.torneioId}`,
        torneioNome: params.torneioNome,
        categoriaNome: "Pagamento total das inscrições",
        valor: null,
        payload: "",
        svg: "",
        pago: false,
        status: "PENDENTE",
      });

      const res = await fetch(`/api/v1/atleta/torneios/${params.torneioId}/pix`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(data?.error || "Falha ao gerar PIX");

      setPixModal({
        inscricaoId: `TOTAL:${params.torneioId}`,
        torneioNome: params.torneioNome,
        categoriaNome: "Pagamento total das inscrições",
        valor: (data?.valor as string | null) ?? null,
        payload: String(data?.payload || ""),
        svg: String(data?.svg || ""),
        pago: false,
        status: "PENDENTE",
      });
    } catch (e: any) {
      setPixErro(e?.message || "Erro ao gerar PIX");
      setPixModal(null);
    } finally {
      setPixCarregando(false);
    }
  }

  async function abrirEditarCamiseta(params: { torneioId: string; torneioNome: string }) {
    try {
      setCamisetaErro(null);
      setCamisetaSalvando(false);
      const res = await fetch(`/api/v1/atleta/torneios/${params.torneioId}/camiseta`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(data?.error || "Falha ao carregar opções de camiseta");
      const opcoes = Array.isArray(data?.opcoes) ? (data.opcoes as any[]).map((s) => String(s)) : [];
      const selecionada = String(data?.selecionada || data?.playDefault || "");
      setCamisetaEditar({
        torneioId: params.torneioId,
        torneioNome: params.torneioNome,
        opcoes,
        selecionada,
      });
    } catch (e: any) {
      setCamisetaErro(e?.message || "Falha ao carregar opções de camiseta");
      setCamisetaEditar(null);
    }
  }

  async function salvarCamisetaEditar() {
    if (!camisetaEditar) return;
    try {
      setCamisetaErro(null);
      if (!camisetaEditar.selecionada.trim()) {
        setCamisetaErro("Selecione uma opção de camiseta.");
        return;
      }
      setCamisetaSalvando(true);
      const res = await fetch(`/api/v1/atleta/torneios/${camisetaEditar.torneioId}/camiseta`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ camisetaOpcao: camisetaEditar.selecionada }),
      });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(data?.error || "Falha ao salvar camiseta");
      setCamisetaEditar(null);
      setFlashOk("Camiseta atualizada para o torneio.");
      void carregarInscricoes();
    } catch (e: any) {
      setCamisetaErro(e?.message || "Falha ao salvar camiseta");
    } finally {
      setCamisetaSalvando(false);
    }
  }

  function abrirEditarInscricao(params: {
    inscricaoId: string;
    torneioId: string;
    torneioNome: string;
    categoriaNome: string;
    equipeNome: string;
  }) {
    setErroEditar(null);
    setBuscaParceiroEditar("");
    setParceirosEditar([]);
    setParceiroSelecionadoEditar(null);
    setInscricaoEditar(params);
  }

  async function salvarEdicaoInscricao() {
    if (!inscricaoEditar) return;
    try {
      if (!parceiroSelecionadoEditar?.id || !parceiroSelecionadoEditar.email) {
        setErroEditar("Selecione um parceiro com perfil no Play na Quadra");
        return;
      }
      setErroEditar(null);
      setSalvandoEdicao(true);
      const res = await fetch(`/api/v1/atleta/inscricoes/${inscricaoEditar.inscricaoId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          equipeNome: inscricaoEditar.equipeNome.trim() || null,
          parceiro: {
            playnaquadraAtletaId: parceiroSelecionadoEditar.playnaquadraAtletaId || parceiroSelecionadoEditar.id,
            nome: parceiroSelecionadoEditar.nome,
            email: parceiroSelecionadoEditar.email,
            telefone: parceiroSelecionadoEditar.telefone || null,
          },
        }),
      });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(data?.error || "Falha ao editar inscrição");
      setInscricaoEditar(null);
      setFlashOk("Inscrição atualizada.");
      void carregarInscricoes();
    } catch (e: any) {
      setErroEditar(e?.message || "Falha ao editar inscrição");
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function cancelarInscricao(inscricaoId: string) {
    const ok = window.confirm("Deseja cancelar esta inscrição? Essa ação não pode ser desfeita.");
    if (!ok) return;
    try {
      setErroInscricoes(null);
      setCancelandoInscricaoId(inscricaoId);
      const res = await fetch(`/api/v1/atleta/inscricoes/${inscricaoId}`, { method: "DELETE" });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(data?.error || "Falha ao cancelar inscrição");
      setFlashOk("Inscrição cancelada.");
      void carregarInscricoes();
    } catch (e: any) {
      setErroInscricoes(e?.message || "Falha ao cancelar inscrição");
    } finally {
      setCancelandoInscricaoId(null);
    }
  }

  async function carregarTorneios() {
    try {
      setCarregandoTorneios(true);
      setErroTorneios(null);
      const res = await fetch("/api/v1/atleta/torneios", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(data?.error || "Erro ao carregar torneios");
      setTorneios((data as Torneio[]) ?? []);
    } catch (e: any) {
      setErroTorneios(e?.message || "Erro ao carregar torneios");
    } finally {
      setCarregandoTorneios(false);
    }
  }

  async function carregarInscricoes() {
    try {
      setCarregandoInscricoes(true);
      setErroInscricoes(null);
      const res = await fetch("/api/v1/atleta/inscricoes", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(data?.error || "Erro ao carregar inscrições");
      setInscricoes((data as Inscricao[]) ?? []);
    } catch (e: any) {
      setErroInscricoes(e?.message || "Erro ao carregar inscrições");
    } finally {
      setCarregandoInscricoes(false);
    }
  }

  useEffect(() => {
    void carregarTorneios();
    void carregarInscricoes();
  }, []);

  useEffect(() => {
    if (tab !== "inscricoes") return;
    void carregarInscricoes();
  }, [tab]);

  useEffect(() => {
    let ativo = true;
    async function carregarCamiseta() {
      if (!modalCategoria) {
        setCamisetaOpcoes([]);
        setCamisetaSelecionada("");
        setCamisetaErro(null);
        setCamisetaCarregando(false);
        return;
      }

      const opcoesT = (modalCategoria.torneio?.camisetaOpcoes ?? []) as string[] | null;
      const tem = Array.isArray(opcoesT) && opcoesT.length > 0;
      if (!tem) {
        setCamisetaOpcoes([]);
        setCamisetaSelecionada("");
        setCamisetaErro(null);
        setCamisetaCarregando(false);
        return;
      }

      try {
        setCamisetaErro(null);
        setCamisetaCarregando(true);
        const res = await fetch(`/api/v1/atleta/torneios/${modalCategoria.torneio.id}/camiseta`, { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as any;
        if (!res.ok) throw new Error(data?.error || "Falha ao carregar camiseta");
        const opcoes = Array.isArray(data?.opcoes) ? (data.opcoes as any[]).map((s) => String(s)) : [];
        const selecionada = String(data?.selecionada || data?.playDefault || "");
        if (!ativo) return;
        setCamisetaOpcoes(opcoes);
        setCamisetaSelecionada(selecionada);
      } catch (e: any) {
        if (!ativo) return;
        setCamisetaErro(e?.message || "Falha ao carregar camiseta");
        setCamisetaOpcoes([]);
        setCamisetaSelecionada("");
      } finally {
        if (ativo) setCamisetaCarregando(false);
      }
    }
    void carregarCamiseta();
    return () => {
      ativo = false;
    };
  }, [modalCategoria]);

  useEffect(() => {
    if (!modalCategoria) return;
    const q = buscaParceiro.trim();
    setErroModal(null);
    if (q.length < 2) {
      setParceiros([]);
      setCarregandoParceiros(false);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        setCarregandoParceiros(true);
        const sp = new URLSearchParams();
        sp.set("q", q);
        sp.set("limite", "20");
        const res = await fetch(`/api/v1/atleta/parceiros?${sp.toString()}`, { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as any;
        if (!res.ok) throw new Error(data?.error || "Falha ao buscar atletas");
        const atletas = (data?.atletas as any[]) ?? [];
        setParceiros(
          atletas.map((a) => ({
            id: String(a.playnaquadraAtletaId || a.id || ""),
            playnaquadraAtletaId: a.playnaquadraAtletaId ?? a.id ?? null,
            nome: String(a.nome || ""),
            telefone: a.telefone ?? null,
            fotoUrl: a.fotoUrl ?? null,
            email: a.email ?? null,
          }))
        );
      } catch (e: any) {
        setParceiros([]);
        setErroModal(e?.message || "Falha ao buscar atletas");
      } finally {
        setCarregandoParceiros(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [buscaParceiro, modalCategoria]);

  useEffect(() => {
    if (!inscricaoEditar) return;
    const q = buscaParceiroEditar.trim();
    setErroEditar(null);
    if (q.length < 2) {
      setParceirosEditar([]);
      setCarregandoParceirosEditar(false);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        setCarregandoParceirosEditar(true);
        const sp = new URLSearchParams();
        sp.set("q", q);
        sp.set("limite", "20");
        const res = await fetch(`/api/v1/atleta/parceiros?${sp.toString()}`, { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as any;
        if (!res.ok) throw new Error(data?.error || "Falha ao buscar atletas");
        const atletas = (data?.atletas as any[]) ?? [];
        setParceirosEditar(
          atletas.map((a) => ({
            id: String(a.playnaquadraAtletaId || a.id || ""),
            playnaquadraAtletaId: a.playnaquadraAtletaId ?? a.id ?? null,
            nome: String(a.nome || ""),
            telefone: a.telefone ?? null,
            fotoUrl: a.fotoUrl ?? null,
            email: a.email ?? null,
          }))
        );
      } catch (e: any) {
        setParceirosEditar([]);
        setErroEditar(e?.message || "Falha ao buscar atletas");
      } finally {
        setCarregandoParceirosEditar(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [buscaParceiroEditar, inscricaoEditar]);

  const header = useMemo(() => {
    const label = tab === "torneios" ? "Torneios abertos" : "Minhas inscrições";
    return (
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Trophy className="w-6 h-6 text-blue-600" />
          {label}
        </h1>
        <p className="text-sm text-gray-600">Acesse os torneios, categorias e suas inscrições.</p>
      </div>
    );
  }, [tab]);

  const torneiosParaExibir = useMemo(() => {
    if (!torneioSlugFiltro) return torneios;
    const filtrados = torneios.filter((t) => t.slug === torneioSlugFiltro);
    return filtrados.length ? filtrados : torneios;
  }, [torneios, torneioSlugFiltro]);

  const meusTorneios = useMemo(() => {
    const map = new Map<
      string,
      {
        torneio: Inscricao["torneio"];
        torneioCamisetaOpcoes: string[] | null;
        minhaCamisetaOpcao: string | null;
        categorias: Array<{
          inscricaoId: string;
          status: string;
          dataInscricao: string;
          categoria: Inscricao["categoria"];
          torneioPix: Inscricao["torneioPix"];
          meuPagamento: Inscricao["meuPagamento"];
          medalha?: "OURO" | "PRATA" | null;
          equipe: Inscricao["equipe"];
        }>;
        ultimaDataInscricao: number;
      }
    >();

    for (const i of inscricoes) {
      const key = i.torneio.id;
      const data = new Date(i.dataInscricao).getTime();
      const current =
        map.get(key) ??
        {
          torneio: i.torneio,
          torneioCamisetaOpcoes: (i.torneioCamisetaOpcoes as string[] | null) ?? null,
          minhaCamisetaOpcao: i.minhaCamisetaOpcao ?? null,
          categorias: [],
          ultimaDataInscricao: data || 0,
        };
      current.categorias.push({
        inscricaoId: i.id,
        status: i.status,
        dataInscricao: i.dataInscricao,
        categoria: i.categoria,
        torneioPix: i.torneioPix,
        meuPagamento: i.meuPagamento,
        medalha: i.medalha ?? null,
        equipe: i.equipe,
      });
      current.ultimaDataInscricao = Math.max(current.ultimaDataInscricao, data || 0);
      if (!map.has(key)) map.set(key, current);
    }

    return Array.from(map.values()).sort((a, b) => b.ultimaDataInscricao - a.ultimaDataInscricao);
  }, [inscricoes]);

  const medalhasResumo = useMemo(() => {
    return inscricoes.reduce(
      (acc, item) => {
        if (item.medalha === "OURO") acc.ouro += 1;
        if (item.medalha === "PRATA") acc.prata += 1;
        return acc;
      },
      { ouro: 0, prata: 0 }
    );
  }, [inscricoes]);

  const categoriaSelecionadaModal = useMemo(() => {
    if (!modalCategoria) return null;
    return modalCategoria.torneio.categorias.find((c) => c.id === modalCategoria.categoriaId) ?? null;
  }, [modalCategoria]);

  const parceiroSelecionadoValido = Boolean(
    parceiroSelecionado?.nome &&
      parceiroSelecionado?.email &&
      (parceiroSelecionado?.playnaquadraAtletaId || parceiroSelecionado?.id)
  );

  const camisetaObrigatoria = Boolean((modalCategoria?.torneio.camisetaOpcoes?.length || 0) > 0);
  const camisetaSelecionadaValida = !camisetaObrigatoria || Boolean(camisetaSelecionada.trim());
  const podeConfirmarNovaInscricao = Boolean(parceiroSelecionadoValido && camisetaSelecionadaValida && !salvando);
  const valorCategoriaModal =
    !modalCategoria || !categoriaSelecionadaModal
      ? null
      : !modalCategoria.torneio.superCampeonato &&
          (modalCategoria.torneio.valorPrimeiraInscricao || modalCategoria.torneio.valorInscricaoAdicional)
        ? [
            modalCategoria.torneio.valorPrimeiraInscricao
              ? `1ª inscrição: ${Number(modalCategoria.torneio.valorPrimeiraInscricao).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
              : null,
            modalCategoria.torneio.valorInscricaoAdicional
              ? `Adicional: ${Number(modalCategoria.torneio.valorInscricaoAdicional).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
              : null,
          ]
            .filter(Boolean)
            .join(" • ")
        : categoriaSelecionadaModal.valorInscricao
          ? `${Number(categoriaSelecionadaModal.valorInscricao).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} por atleta`
          : "Sem taxa";

  if (carregandoTorneios && tab === "torneios") {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse bg-white rounded-xl shadow-lg p-8">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          {header}
          <div className="flex items-center gap-2">
            <Link
              href="/atleta/perfil"
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors text-sm font-semibold"
            >
              Meu perfil
            </Link>
            <Link
              href="/atleta/jogos"
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors text-sm font-semibold"
            >
              Meus jogos
            </Link>
            <form action="/api/v1/auth/logout" method="post">
              <button type="submit" className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors text-sm font-semibold">
                Sair
              </button>
            </form>
          </div>
        </div>

        {flashOk && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">{flashOk}</div>}
        {tab === "torneios" && erroTorneios && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{erroTorneios}</div>}
        {tab === "inscricoes" && erroInscricoes && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{erroInscricoes}</div>}
        {tab === "inscricoes" && pixErro && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{pixErro}</div>}

        {tab === "inscricoes" && (medalhasResumo.ouro > 0 || medalhasResumo.prata > 0) ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-amber-700">Medalhas de ouro</div>
              <div className="mt-1 text-2xl font-black text-slate-900">{medalhasResumo.ouro}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Medalhas de prata</div>
              <div className="mt-1 text-2xl font-black text-slate-900">{medalhasResumo.prata}</div>
            </div>
          </div>
        ) : null}

        <div className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setTab("torneios")}
            className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
              tab === "torneios" ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            Torneios abertos
          </button>
          <button
            type="button"
            onClick={() => setTab("inscricoes")}
            className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
              tab === "inscricoes" ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            Minhas inscrições
          </button>
        </div>

        {tab === "torneios" ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              {torneioSlugFiltro ? (
                <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                  Filtrado por torneio: {torneioSlugFiltro}
                  <button
                    type="button"
                    onClick={() => setTorneioSlugFiltro(null)}
                    className="ml-1 inline-flex items-center rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Limpar
                  </button>
                </div>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => carregarTorneios()}
                disabled={carregandoTorneios}
                className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors text-sm font-semibold disabled:opacity-50"
              >
                {carregandoTorneios ? "Atualizando..." : "Atualizar"}
              </button>
            </div>

            {torneiosParaExibir.length === 0 ? (
              <div className="bg-white rounded-xl shadow-lg p-8 text-center">
                <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Nenhum torneio disponível</p>
                <p className="text-gray-500 text-sm mt-1">Quando as inscrições abrirem, os torneios aparecerão aqui.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {torneiosParaExibir.map((t) => (
                  <div key={t.id} className="bg-white rounded-xl shadow-lg overflow-hidden">
                    <div className="p-6 border-b border-gray-100">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-lg font-semibold text-gray-900 truncate">{t.nome}</div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {statusBadge(t.status)}
                            {t.esporteNome && (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                                {t.esporteNome}
                              </span>
                            )}
                          </div>
                        </div>
                        <Link href={`/torneios/${t.slug}`} className="text-sm font-semibold text-blue-600 hover:text-blue-700">
                          Ver
                        </Link>
                      </div>
                      <div className="mt-4 space-y-2 text-sm text-gray-700">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span>{formatDateRange(t.dataInicio, t.dataFim) || "Datas a definir"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-gray-400" />
                          <span className="truncate">{t.local}</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-6">
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-3">Categorias</div>
                      {t.categorias.length === 0 ? (
                        <div className="text-sm text-gray-600">Sem categorias cadastradas.</div>
                      ) : (
                        <div className="space-y-2">
                          {t.categorias.map((c) => (
                            <div key={c.id} className="rounded-lg border border-gray-200 p-4 flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <div className="font-semibold text-gray-900">{c.nome}</div>
                                  {c.dataHorario ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                                      {formatDataHora(c.dataHorario)}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="text-xs text-gray-600 mt-1">
                                  {!t.superCampeonato && (t.valorPrimeiraInscricao || t.valorInscricaoAdicional) ? (
                                    <>
                                      {t.valorPrimeiraInscricao
                                        ? `1ª: ${Number(t.valorPrimeiraInscricao).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
                                        : "1ª: —"}
                                      <span className="mx-1">•</span>
                                      {t.valorInscricaoAdicional
                                        ? `adicional: ${Number(t.valorInscricaoAdicional).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
                                        : "adicional: —"}
                                      {" por atleta"}
                                    </>
                                  ) : c.valorInscricao ? (
                                    `${Number(c.valorInscricao).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} por atleta`
                                  ) : (
                                    "Sem taxa"
                                  )}
                                  <span className="mx-1">•</span>
                                  {c.inscritos} {c.inscritos === 1 ? "inscrito" : "inscritos"}
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-2">
                                {c.slug && (
                                  <Link
                                    href={`/torneios/${t.slug}/categoria/${c.slug}`}
                                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 whitespace-nowrap"
                                  >
                                    Ver categoria
                                  </Link>
                                )}
                                {c.inscricoesAbertas === false ? (
                                  <span className="px-3 py-2 rounded-lg bg-gray-100 text-gray-600 text-sm font-semibold whitespace-nowrap">
                                    Inscrições encerradas
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setErroModal(null);
                                      setEquipeNome("");
                                      setBuscaParceiro("");
                                      setParceiros([]);
                                      setParceiroSelecionado(null);
                                      setModalCategoria({ torneio: t, categoriaId: c.id });
                                    }}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-semibold whitespace-nowrap"
                                  >
                                    Inscrever
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => carregarInscricoes()}
                disabled={carregandoInscricoes}
                className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors text-sm font-semibold disabled:opacity-50"
              >
                {carregandoInscricoes ? "Atualizando..." : "Atualizar"}
              </button>
            </div>

            {carregandoInscricoes ? (
              <div className="bg-white rounded-xl shadow-lg p-8">
                <div className="animate-pulse space-y-3">
                  <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                  <div className="h-24 bg-gray-200 rounded"></div>
                </div>
              </div>
            ) : meusTorneios.length === 0 ? (
              <div className="bg-white rounded-xl shadow-lg p-8 text-center">
                <Trophy className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Você ainda não tem inscrições</p>
                <p className="text-gray-500 text-sm mt-1">Abra um torneio e clique em Inscrever para começar.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {meusTorneios.map((t) => {
                  const pixOkTorneio = t.categorias.some((c) => Boolean(c.torneioPix?.chave && c.torneioPix?.nome && c.torneioPix?.cidade));
                  const totalPendente = t.categorias.reduce((acc, c) => {
                    const statusPg = String(c.meuPagamento?.status || (c.meuPagamento?.pago ? "PAGO" : "PENDENTE"));
                    if (statusPg !== "PENDENTE") return acc;
                    const valorRaw = (c.meuPagamento?.valorDevido ?? c.categoria?.valorInscricao ?? null) as string | null;
                    const valorNum = valorRaw ? Number(String(valorRaw).replace(",", ".")) : 0;
                    return valorNum > 0 ? acc + valorNum : acc;
                  }, 0);
                  const podePagarTotal = pixOkTorneio && totalPendente > 0;
                  const totalLabel = totalPendente > 0 ? totalPendente.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : null;

                  return (
                    <div key={t.torneio.id} className="bg-white rounded-xl shadow-lg overflow-hidden">
                      <div className="p-6 border-b border-gray-100">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-base font-semibold text-gray-900 truncate">{t.torneio.nome}</div>
                            <div className="text-sm text-gray-600 truncate mt-1">
                              {t.categorias.length} {t.categorias.length === 1 ? "categoria" : "categorias"}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {(t.categorias.some((c) => c.medalha === "OURO") || t.categorias.some((c) => c.medalha === "PRATA")) && (
                              <div className="flex items-center gap-2">
                                {t.categorias.some((c) => c.medalha === "OURO") ? medalhaBadge("OURO") : null}
                                {t.categorias.some((c) => c.medalha === "PRATA") ? medalhaBadge("PRATA") : null}
                              </div>
                            )}
                            {podePagarTotal && (
                              <button
                                type="button"
                                onClick={() => void abrirPixTotal({ torneioId: t.torneio.id, torneioNome: t.torneio.nome })}
                                className="text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                              >
                                Pagar PIX (total{totalLabel ? ` • ${totalLabel}` : ""})
                              </button>
                            )}
                            {(t.torneioCamisetaOpcoes?.length || 0) > 0 && (
                              <button
                                type="button"
                                onClick={() => void abrirEditarCamiseta({ torneioId: t.torneio.id, torneioNome: t.torneio.nome })}
                                className="text-sm font-semibold text-slate-700 hover:text-slate-900"
                              >
                                Camiseta{t.minhaCamisetaOpcao ? ` • ${t.minhaCamisetaOpcao}` : ""}
                              </button>
                            )}
                            <Link href={`/torneios/${t.torneio.slug}`} className="text-sm font-semibold text-blue-600 hover:text-blue-700">
                              Ver
                            </Link>
                          </div>
                        </div>
                      </div>
                      <div className="p-6">
                        <div className="space-y-3">
                          {t.categorias.map((c) => (
                          <div key={c.inscricaoId} className="rounded-lg border border-gray-200 p-4 space-y-2">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <div className="font-semibold text-gray-900">{c.categoria.nome}</div>
                                  {medalhaBadge(c.medalha)}
                                </div>
                                <div className="text-xs text-gray-600 mt-1">{c.equipe.nome || "Dupla"}</div>
                              </div>
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 whitespace-nowrap">
                                {c.status}
                              </span>
                            </div>

                            <div className="mt-2 space-y-1 text-sm text-gray-700">
                              {c.equipe.atletas.map((a) => (
                                <div key={a.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                                  <span className="font-medium text-gray-900 truncate">{a.nome}</span>
                                  <span className="text-gray-600 truncate">{a.email}</span>
                                </div>
                              ))}
                            </div>

                            {(() => {
                              const pixOk = Boolean(c.torneioPix?.chave && c.torneioPix?.nome && c.torneioPix?.cidade);
                              const valorRaw = (c.meuPagamento?.valorDevido ?? c.categoria?.valorInscricao ?? null) as string | null;
                              const valorNum = valorRaw ? Number(String(valorRaw).replace(",", ".")) : 0;
                              const valorLabel =
                                valorNum > 0 ? valorNum.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : null;
                              const statusPg = String(c.meuPagamento?.status || (c.meuPagamento?.pago ? "PAGO" : "PENDENTE"));
                              const pago = statusPg === "PAGO";
                              const processando = statusPg === "PROCESSANDO";
                              const podePagar = pixOk && statusPg === "PENDENTE" && valorNum > 0;
                              const podeEditar = statusPg === "PENDENTE";
                              const torneioComJogos = Boolean(t.torneio.temJogosEmAndamento);
                              const podeCancelar = statusPg === "PENDENTE" && !torneioComJogos;
                              const bloqueioAcao = pago ? "Bloqueado: pagamento já confirmado" : processando ? "Bloqueado: pagamento em processamento" : "Bloqueado";
                              const bloqueioCancelar = torneioComJogos ? "Bloqueado: torneio com jogos em andamento" : bloqueioAcao;
                              const statusLabel = pago ? "Pago" : processando ? "Em processamento" : "Pendente";
                              const statusClass = pago ? "text-emerald-700 font-semibold" : processando ? "text-blue-700 font-semibold" : "text-amber-800 font-semibold";

                              return (
                                <>
                                  <div className="pt-2 border-t border-gray-100 text-xs text-gray-700 flex items-center justify-between gap-2">
                                    <span className="font-semibold">Pagamento:</span>
                                    <span className={statusClass}>
                                      {statusLabel}
                                      {valorLabel ? ` • ${valorLabel}` : ""}
                                    </span>
                                  </div>

                                  <div className="pt-2 flex items-center justify-between gap-3">
                                    {c.categoria.slug ? (
                                      <Link
                                        href={`/torneios/${t.torneio.slug}/categoria/${c.categoria.slug}`}
                                        className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                                      >
                                        Ver categoria
                                      </Link>
                                    ) : (
                                      <span />
                                    )}

                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        disabled={!podeEditar}
                                        title={!podeEditar ? bloqueioAcao : undefined}
                                        onClick={() =>
                                          podeEditar
                                            ? abrirEditarInscricao({
                                                inscricaoId: c.inscricaoId,
                                                torneioId: t.torneio.id,
                                                torneioNome: t.torneio.nome,
                                                categoriaNome: c.categoria.nome,
                                                equipeNome: c.equipe.nome || "",
                                              })
                                            : undefined
                                        }
                                        className="text-xs font-semibold text-slate-700 hover:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        Editar
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!podeCancelar || cancelandoInscricaoId === c.inscricaoId}
                                        title={!podeCancelar ? bloqueioCancelar : undefined}
                                        onClick={() => (podeCancelar ? void cancelarInscricao(c.inscricaoId) : undefined)}
                                        className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        Cancelar
                                      </button>
                                      {podePagar && (
                                        <button
                                          type="button"
                                          onClick={() => void abrirPix({ inscricaoId: c.inscricaoId, torneioNome: t.torneio.nome, categoriaNome: c.categoria.nome })}
                                          className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                                        >
                                          Pagar PIX
                                        </button>
                                      )}
                                      <Link href="/atleta/jogos" className="text-xs font-semibold text-gray-700 hover:text-gray-900">
                                        Meus jogos
                                      </Link>
                                    </div>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {modalCategoria && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setModalCategoria(null)}>
          <div className="w-full max-w-xl bg-white rounded-xl shadow-lg" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 p-6">
              <div>
                {(() => {
                  return (
                    <>
                <div className="text-xs text-gray-500">Inscrição</div>
                <div className="text-lg font-semibold text-gray-900">{modalCategoria.torneio.nome}</div>
                <div className="mt-1 text-sm text-gray-600">
                  <div>
                    Categoria: {categoriaSelecionadaModal?.nome ?? "-"}
                    {categoriaSelecionadaModal?.dataHorario ? ` • ${formatDataHora(categoriaSelecionadaModal.dataHorario)}` : ""}
                  </div>
                  <div>Selecione um parceiro com perfil válido no Play na Quadra para criar a dupla.</div>
                </div>
                    </>
                  );
                })()}
              </div>
              <button type="button" onClick={() => setModalCategoria(null)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-5 p-6">
              {erroModal && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{erroModal}</div>}

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Resumo da inscrição</div>
                <div className="mt-2 grid grid-cols-1 gap-3 text-sm text-slate-700 md:grid-cols-2">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Categoria</div>
                    <div className="mt-1 font-semibold text-slate-900">{categoriaSelecionadaModal?.nome ?? "-"}</div>
                    {categoriaSelecionadaModal?.dataHorario && (
                      <div className="mt-1 text-xs text-slate-600">{formatDataHora(categoriaSelecionadaModal.dataHorario)}</div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Valor</div>
                    <div className="mt-1 font-semibold text-slate-900">{valorCategoriaModal || "-"}</div>
                    <div className="mt-1 text-xs text-slate-600">O parceiro precisa ter perfil confirmado no Play para seguir.</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Nome da dupla (opcional)</label>
                  <input
                    value={equipeNome}
                    onChange={(e) => setEquipeNome(e.target.value)}
                    placeholder="Ex: Os Invencíveis"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  />
                </div>
              </div>

              {(modalCategoria.torneio.camisetaOpcoes?.length || 0) > 0 && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Camiseta (torneio)</label>
                  {camisetaCarregando ? (
                    <div className="text-sm text-gray-600">Carregando opções…</div>
                  ) : (
                    <select
                      value={camisetaSelecionada}
                      onChange={(e) => setCamisetaSelecionada(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    >
                      <option value="">Selecione…</option>
                      {camisetaOpcoes.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  )}
                  {camisetaErro && <div className="text-sm text-red-600">{camisetaErro}</div>}
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Buscar parceiro</label>
                <input
                  value={buscaParceiro}
                  onChange={(e) => {
                    setBuscaParceiro(e.target.value);
                    setParceiroSelecionado(null);
                  }}
                  placeholder="Digite nome ou telefone (mín. 2 caracteres)"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                />
                {carregandoParceiros && <div className="text-sm text-gray-600">Buscando parceiros com perfil válido...</div>}
                {!parceiroSelecionado && !carregandoParceiros && (
                  <div className="text-xs text-gray-500">Selecione um atleta da lista para confirmar a dupla antes de enviar.</div>
                )}
              </div>

              {parceiroSelecionado ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex items-start gap-3">
                    {parceiroSelecionado.fotoUrl ? (
                      <img
                        src={parceiroSelecionado.fotoUrl}
                        alt={parceiroSelecionado.nome}
                        className="h-10 w-10 rounded-full object-cover border border-gray-200 bg-white"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-sm font-semibold border border-gray-200">
                        {getInitials(parceiroSelecionado.nome)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-semibold text-gray-900 truncate">{parceiroSelecionado.nome}</div>
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                          Perfil Play confirmado
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 truncate">{parceiroSelecionado.email || "Sem email"}</div>
                      {parceiroSelecionado.telefone && <div className="text-sm text-gray-600 truncate">{parceiroSelecionado.telefone}</div>}
                      <div className="mt-1 text-xs text-emerald-700">
                        Esse parceiro será enviado junto com a categoria selecionada quando você confirmar a inscrição.
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setParceiroSelecionado(null)}
                    className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors text-sm font-semibold"
                  >
                    Trocar
                  </button>
                </div>
              ) : parceiros.length > 0 ? (
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <div className="max-h-64 overflow-auto divide-y divide-gray-100">
                    {parceiros.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setParceiroSelecionado(p)}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          {p.fotoUrl ? (
                            <img
                              src={p.fotoUrl}
                              alt={p.nome}
                              className="h-10 w-10 rounded-full object-cover border border-gray-200 bg-white"
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-sm font-semibold border border-gray-200">
                              {getInitials(p.nome)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="font-semibold text-gray-900">{p.nome}</div>
                              <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 ring-1 ring-blue-200">
                                Pronto para inscrição
                              </span>
                            </div>
                            <div className="text-sm text-gray-600 truncate">{p.email || "Sem email"}</div>
                            {p.telefone && <div className="text-sm text-gray-600 truncate">{p.telefone}</div>}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : buscaParceiro.trim().length >= 2 && !carregandoParceiros ? (
                <div className="text-sm text-gray-600">Nenhum atleta encontrado.</div>
              ) : null}

              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                {parceiroSelecionadoValido
                  ? `Tudo pronto: você vai inscrever a categoria ${categoriaSelecionadaModal?.nome ?? "selecionada"} com ${parceiroSelecionado?.nome}.`
                  : "Falta selecionar um parceiro da lista para liberar a confirmação da inscrição."}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={() => setModalCategoria(null)}
                  disabled={salvando}
                  className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors text-sm font-semibold disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      if (!parceiroSelecionado?.id || !parceiroSelecionado.email) {
                        setErroModal("Selecione um parceiro com perfil no Play na Quadra");
                        return;
                      }
                      if ((modalCategoria.torneio.camisetaOpcoes?.length || 0) > 0 && !camisetaSelecionada.trim()) {
                        setErroModal("Selecione a camiseta para este torneio");
                        return;
                      }
                      setSalvando(true);
                      setErroModal(null);
                      setFlashOk(null);
                      const res = await fetch("/api/v1/atleta/inscricoes", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          categoriaId: modalCategoria.categoriaId,
                          equipeNome: equipeNome.trim() || null,
                          camisetaOpcao: camisetaSelecionada.trim() || null,
                          parceiro: {
                            playnaquadraAtletaId: parceiroSelecionado.playnaquadraAtletaId || parceiroSelecionado.id,
                            nome: parceiroSelecionado.nome,
                            email: parceiroSelecionado.email,
                            telefone: parceiroSelecionado.telefone || null,
                          },
                        }),
                      });
                      const data = (await res.json().catch(() => null)) as any;
                      if (!res.ok) throw new Error(data?.error || "Falha ao criar inscrição");
                      setFlashOk("Inscrição criada. Aguardando confirmação.");
                      void carregarInscricoes();
                      setTab("inscricoes");
                      setModalCategoria(null);
                    } catch (e: any) {
                      setErroModal(e?.message || "Falha ao criar inscrição");
                    } finally {
                      setSalvando(false);
                    }
                  }}
                  disabled={!podeConfirmarNovaInscricao}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {salvando ? "Enviando..." : "Confirmar inscrição"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {inscricaoEditar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setInscricaoEditar(null)}>
          <div className="w-full max-w-xl bg-white rounded-xl shadow-lg" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 p-6">
              <div>
                <div className="text-xs text-gray-500">Editar inscrição</div>
                <div className="text-lg font-semibold text-gray-900">{inscricaoEditar.torneioNome}</div>
                <div className="mt-1 text-sm text-gray-600">{inscricaoEditar.categoriaNome}</div>
              </div>
              <button type="button" onClick={() => setInscricaoEditar(null)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-5 p-6">
              {erroEditar && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{erroEditar}</div>}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Nome da dupla (opcional)</label>
                  <input
                    value={inscricaoEditar.equipeNome}
                    onChange={(e) => setInscricaoEditar((p) => (p ? { ...p, equipeNome: e.target.value } : p))}
                    placeholder="Ex: Os Invencíveis"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Buscar novo parceiro</label>
                <input
                  value={buscaParceiroEditar}
                  onChange={(e) => {
                    setBuscaParceiroEditar(e.target.value);
                    setParceiroSelecionadoEditar(null);
                  }}
                  placeholder="Digite nome ou telefone (mín. 2 caracteres)"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                />
                {carregandoParceirosEditar && <div className="text-sm text-gray-600">Buscando...</div>}
              </div>

              {parceiroSelecionadoEditar ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex items-start gap-3">
                    {parceiroSelecionadoEditar.fotoUrl ? (
                      <img
                        src={parceiroSelecionadoEditar.fotoUrl}
                        alt={parceiroSelecionadoEditar.nome}
                        className="h-10 w-10 rounded-full object-cover border border-gray-200 bg-white"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-sm font-semibold border border-gray-200">
                        {getInitials(parceiroSelecionadoEditar.nome)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900 truncate">{parceiroSelecionadoEditar.nome}</div>
                      <div className="text-sm text-gray-600 truncate">{parceiroSelecionadoEditar.email || "Sem email"}</div>
                      {parceiroSelecionadoEditar.telefone && <div className="text-sm text-gray-600 truncate">{parceiroSelecionadoEditar.telefone}</div>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setParceiroSelecionadoEditar(null)}
                    className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors text-sm font-semibold"
                  >
                    Trocar
                  </button>
                </div>
              ) : parceirosEditar.length > 0 ? (
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <div className="max-h-64 overflow-auto divide-y divide-gray-100">
                    {parceirosEditar.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setParceiroSelecionadoEditar(p)}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          {p.fotoUrl ? (
                            <img
                              src={p.fotoUrl}
                              alt={p.nome}
                              className="h-10 w-10 rounded-full object-cover border border-gray-200 bg-white"
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-sm font-semibold border border-gray-200">
                              {getInitials(p.nome)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900">{p.nome}</div>
                            <div className="text-sm text-gray-600 truncate">{p.email || "Sem email"}</div>
                            {p.telefone && <div className="text-sm text-gray-600 truncate">{p.telefone}</div>}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : buscaParceiroEditar.trim().length >= 2 && !carregandoParceirosEditar ? (
                <div className="text-sm text-gray-600">Nenhum atleta encontrado.</div>
              ) : null}

              <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={() => setInscricaoEditar(null)}
                  disabled={salvandoEdicao}
                  className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors text-sm font-semibold disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void salvarEdicaoInscricao()}
                  disabled={salvandoEdicao || !parceiroSelecionadoEditar?.id || !parceiroSelecionadoEditar.email}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {salvandoEdicao ? "Salvando..." : "Salvar alterações"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {camisetaEditar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setCamisetaEditar(null)}>
          <div className="w-full max-w-md bg-white rounded-xl shadow-lg" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 p-6">
              <div className="min-w-0">
                <div className="text-xs text-gray-500">Camiseta do torneio</div>
                <div className="text-lg font-semibold text-gray-900 truncate">{camisetaEditar.torneioNome}</div>
              </div>
              <button
                type="button"
                onClick={() => setCamisetaEditar(null)}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 p-6">
              {camisetaErro && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{camisetaErro}</div>}

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Selecione</label>
                <select
                  value={camisetaEditar.selecionada}
                  onChange={(e) => setCamisetaEditar((p) => (p ? { ...p, selecionada: e.target.value } : p))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                >
                  <option value="">Selecione…</option>
                  {camisetaEditar.opcoes.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCamisetaEditar(null)}
                  disabled={camisetaSalvando}
                  className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors text-sm font-semibold disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void salvarCamisetaEditar()}
                  disabled={camisetaSalvando}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors text-sm font-semibold disabled:opacity-50"
                >
                  {camisetaSalvando ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {pixModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setPixModal(null)}>
          <div className="w-full max-w-md bg-white rounded-xl shadow-lg" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 p-6">
              <div className="min-w-0">
                <div className="text-xs text-gray-500">Pagamento PIX</div>
                <div className="text-lg font-semibold text-gray-900 truncate">{pixModal.torneioNome}</div>
                <div className="mt-1 text-sm text-gray-600 truncate">{pixModal.categoriaNome}</div>
              </div>
              <button type="button" onClick={() => setPixModal(null)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 p-6">
              {pixCarregando ? (
                <div className="text-sm text-gray-600">Gerando QR Code…</div>
              ) : (
                <>
                  {pixModal.valor && (
                    <div className="text-sm font-semibold text-gray-900">
                      Valor: {Number(pixModal.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </div>
                  )}

                  {pixModal.pago ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                      Este pagamento já está marcado como pago.
                    </div>
                  ) : pixModal.status === "PROCESSANDO" ? (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                      Pagamento em processamento. Aguarde a confirmação do organizador.
                    </div>
                  ) : null}

                  {pixModal.svg ? (
                    <div className="rounded-lg border border-gray-200 bg-white p-3 flex items-center justify-center">
                      <div
                        className="w-full max-w-[260px]"
                        dangerouslySetInnerHTML={{ __html: pixModal.svg }}
                      />
                    </div>
                  ) : (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      Não foi possível gerar o QR Code.
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">PIX Copia e Cola</div>
                    <textarea
                      value={pixModal.payload}
                      readOnly
                      rows={4}
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-800"
                    />
                    <div className="flex items-center justify-end gap-2">
                      {pixModal.payload && !pixModal.pago && pixModal.status !== "PROCESSANDO" && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              setPixErro(null);
                              const isTotal = pixModal.inscricaoId.startsWith("TOTAL:");
                              if (isTotal) {
                                const torneioId = pixModal.inscricaoId.slice("TOTAL:".length);
                                const res = await fetch(`/api/v1/atleta/torneios/${torneioId}/pagamento-concluido`, { method: "POST" });
                                const data = (await res.json().catch(() => null)) as any;
                                if (!res.ok) throw new Error(data?.error || "Falha ao registrar pagamento");
                              } else {
                                const res = await fetch(`/api/v1/atleta/inscricoes/${pixModal.inscricaoId}/pagamento-concluido`, { method: "POST" });
                                const data = (await res.json().catch(() => null)) as any;
                                if (!res.ok) throw new Error(data?.error || "Falha ao registrar pagamento");
                              }

                              setPixModal(null);
                              setFlashOk("Pagamento informado. Status em processamento até confirmação.");
                              void carregarInscricoes();
                            } catch (e: any) {
                              setPixErro(e?.message || "Falha ao registrar pagamento");
                            }
                          }}
                          className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors text-sm font-semibold"
                        >
                          Pagamento concluído
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(pixModal.payload);
                            setFlashOk("Código PIX copiado.");
                          } catch {
                            setPixErro("Não foi possível copiar. Selecione e copie manualmente.");
                          }
                        }}
                        className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors text-sm font-semibold"
                      >
                        Copiar
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

