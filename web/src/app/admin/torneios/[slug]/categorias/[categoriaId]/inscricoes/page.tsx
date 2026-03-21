"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Banknote, Gamepad2, Plus, Save, Trash2, Users, X } from "lucide-react";

type Categoria = {
  id: string;
  torneioId: string;
  nome: string;
  genero: "MASCULINO" | "FEMININO" | "MISTO";
  valorInscricao: string | null;
  vagasMaximas: number | null;
};

type Inscricao = {
  id: string;
  status: string;
  dataInscricao: string;
  equipe: {
    id: string;
    nome: string | null;
    atletas: { id: string; nome: string; email: string; telefone: string | null; fotoUrl?: string | null }[];
  };
};

type Atleta = {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  fotoUrl?: string | null;
};

export default function AdminCategoriaInscricoesPage() {
  const params = useParams<{ slug: string; categoriaId: string }>();
  const slug = params.slug;
  const categoriaId = params.categoriaId;

  const [categoria, setCategoria] = useState<Categoria | null>(null);
  const [inscricoes, setInscricoes] = useState<Inscricao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [mostraForm, setMostraForm] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);

  const [buscaAtletaA, setBuscaAtletaA] = useState("");
  const [resultadosAtletaA, setResultadosAtletaA] = useState<Atleta[]>([]);
  const [buscandoAtletaA, setBuscandoAtletaA] = useState(false);
  const [buscaAtletaB, setBuscaAtletaB] = useState("");
  const [resultadosAtletaB, setResultadosAtletaB] = useState<Atleta[]>([]);
  const [buscandoAtletaB, setBuscandoAtletaB] = useState(false);

  const [form, setForm] = useState({
    equipeNome: "",
    atletaANome: "",
    atletaAEmail: "",
    atletaATelefone: "",
    atletaAPlayId: "",
    atletaAFotoUrl: "",
    atletaBNome: "",
    atletaBEmail: "",
    atletaBTelefone: "",
    atletaBPlayId: "",
    atletaBFotoUrl: "",
    status: "APROVADA" as "PENDENTE" | "APROVADA" | "RECUSADA" | "FILA_ESPERA",
  });

  const podeSalvar = useMemo(() => {
    return Boolean(form.atletaANome.trim() && form.atletaAEmail.trim() && form.atletaBNome.trim() && form.atletaBEmail.trim());
  }, [form]);

  async function carregar() {
    try {
      setCarregando(true);
      setErro(null);

      const [resCat, resIns] = await Promise.all([
        fetch(`/api/v1/torneios/${slug}/categorias`, { cache: "no-store" }),
        fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/inscricoes`, { cache: "no-store" }),
      ]);

      if (!resCat.ok) {
        const msg = await resCat.json().catch(() => null);
        throw new Error(msg?.error || "Falha ao carregar categoria");
      }
      if (!resIns.ok) {
        const msg = await resIns.json().catch(() => null);
        throw new Error(msg?.error || "Falha ao carregar inscrições");
      }

      const cats = (await resCat.json()) as Categoria[];
      const cat = cats.find((c) => c.id === categoriaId) ?? null;
      setCategoria(cat);

      const lista = (await resIns.json()) as Inscricao[];
      setInscricoes(lista);
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
  }, [slug, categoriaId]);

  useEffect(() => {
    if (!mostraForm) return;
    const q = buscaAtletaA.trim();
    if (q.length < 2) {
      setResultadosAtletaA([]);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        setBuscandoAtletaA(true);
        const res = await fetch(`/api/v1/admin/playnaquadra/atletas?q=${encodeURIComponent(q)}&limit=8`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setResultadosAtletaA(data.atletas || []);
      } finally {
        setBuscandoAtletaA(false);
      }
    }, 250);

    return () => clearTimeout(timeout);
  }, [buscaAtletaA, mostraForm]);

  useEffect(() => {
    if (!mostraForm) return;
    const q = buscaAtletaB.trim();
    if (q.length < 2) {
      setResultadosAtletaB([]);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        setBuscandoAtletaB(true);
        const res = await fetch(`/api/v1/admin/playnaquadra/atletas?q=${encodeURIComponent(q)}&limit=8`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setResultadosAtletaB(data.atletas || []);
      } finally {
        setBuscandoAtletaB(false);
      }
    }, 250);

    return () => clearTimeout(timeout);
  }, [buscaAtletaB, mostraForm]);

  function abrirNova() {
    setMostraForm(true);
    setBuscaAtletaA("");
    setResultadosAtletaA([]);
    setBuscaAtletaB("");
    setResultadosAtletaB([]);
    setForm({
      equipeNome: "",
      atletaANome: "",
      atletaAEmail: "",
      atletaATelefone: "",
      atletaAPlayId: "",
      atletaAFotoUrl: "",
      atletaBNome: "",
      atletaBEmail: "",
      atletaBTelefone: "",
      atletaBPlayId: "",
      atletaBFotoUrl: "",
      status: "APROVADA",
    });
  }

  function fecharForm() {
    setMostraForm(false);
    setBuscaAtletaA("");
    setResultadosAtletaA([]);
    setBuscaAtletaB("");
    setResultadosAtletaB([]);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!podeSalvar) {
      setErro("Preencha os dados dos dois atletas (nome e email).");
      return;
    }

    try {
      setSalvando(true);
      const payload = {
        equipeNome: form.equipeNome.trim() || undefined,
        status: form.status,
        atletaA: {
          nome: form.atletaANome.trim(),
          email: form.atletaAEmail.trim(),
          telefone: form.atletaATelefone.trim() || undefined,
          playnaquadraAtletaId: form.atletaAPlayId || undefined,
          fotoUrl: form.atletaAFotoUrl || undefined,
        },
        atletaB: {
          nome: form.atletaBNome.trim(),
          email: form.atletaBEmail.trim(),
          telefone: form.atletaBTelefone.trim() || undefined,
          playnaquadraAtletaId: form.atletaBPlayId || undefined,
          fotoUrl: form.atletaBFotoUrl || undefined,
        },
      };

      const res = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/inscricoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.error || "Falha ao criar inscrição");
      }

      await carregar();
      setMostraForm(false);
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    } finally {
      setSalvando(false);
    }
  }

  async function onExcluir(inscricaoId: string) {
    setErro(null);
    const ok = window.confirm("Deseja excluir esta inscrição?");
    if (!ok) return;

    try {
      setExcluindoId(inscricaoId);
      const res = await fetch(`/api/v1/torneios/${slug}/categorias/${categoriaId}/inscricoes/${inscricaoId}`, { method: "DELETE" });
      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.error || "Falha ao excluir inscrição");
      }
      await carregar();
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    } finally {
      setExcluindoId(null);
    }
  }

  const total = inscricoes.length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href={`/admin/torneios/${slug}`} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao torneio
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">{categoria ? `Inscrições — ${categoria.nome}` : "Inscrições"}</h1>
          {categoria && (
            <p className="text-sm text-slate-600">
              {categoria.genero} •{" "}
              {categoria.valorInscricao ? (
                <>
                  {Number(categoria.valorInscricao).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} por atleta{" "}
                  <span className="text-slate-500">
                    (dupla: {(Number(categoria.valorInscricao) * 2).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})
                  </span>
                </>
              ) : (
                "Sem taxa"
              )}{" "}
              • {categoria.vagasMaximas ? `${categoria.vagasMaximas} vagas` : "Sem limite"}
            </p>
          )}

          <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-1">
            <Link
              href={`/admin/torneios/${slug}/categorias/${categoriaId}/inscricoes`}
              className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
            >
              <Banknote className="h-4 w-4" />
              Inscrições
            </Link>
            <Link
              href={`/admin/torneios/${slug}/categorias/${categoriaId}/jogos`}
              className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Gamepad2 className="h-4 w-4" />
              Jogos
            </Link>
          </div>
        </div>

        <button
          type="button"
          onClick={abrirNova}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" />
          Nova inscrição
        </button>
      </div>

      {erro && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider">Inscrições</div>
              <div className="text-2xl font-bold text-slate-900">{total}</div>
            </div>
            <div className="h-10 w-10 rounded-lg bg-orange-50 flex items-center justify-center">
              <Users className="h-5 w-5 text-orange-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <div className="text-xs text-slate-500 uppercase tracking-wider">Pendentes</div>
          <div className="text-2xl font-bold text-slate-900">{inscricoes.filter((i) => i.status === "PENDENTE").length}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <div className="text-xs text-slate-500 uppercase tracking-wider">Aprovadas</div>
          <div className="text-2xl font-bold text-slate-900">{inscricoes.filter((i) => i.status === "APROVADA").length}</div>
        </div>
      </div>

      {mostraForm && (
        <form onSubmit={onSubmit} className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div className="font-semibold text-slate-900">Nova inscrição</div>
            <button type="button" onClick={fecharForm} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
              <X className="h-4 w-4" />
              Fechar
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Nome da equipe (opcional)</label>
              <input
                value={form.equipeNome}
                onChange={(e) => setForm((p) => ({ ...p, equipeNome: e.target.value }))}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
              />
              <div className="text-xs text-slate-500">Se vazio, será gerado automaticamente como Nome1/Nome2.</div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as any }))}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 bg-white"
              >
                <option value="APROVADA">APROVADA</option>
                <option value="PENDENTE">PENDENTE</option>
                <option value="RECUSADA">RECUSADA</option>
                <option value="FILA_ESPERA">FILA_ESPERA</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="font-semibold text-slate-900">Atleta 1</div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Buscar atleta</label>
                <input
                  value={buscaAtletaA}
                  onChange={(e) => setBuscaAtletaA(e.target.value)}
                  placeholder="Digite nome ou email…"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                />
                {buscandoAtletaA && <div className="text-xs text-slate-500">Buscando…</div>}
                {resultadosAtletaA.length > 0 && (
                  <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
                    {resultadosAtletaA.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          setForm((p) => ({
                            ...p,
                            atletaANome: a.nome,
                            atletaAEmail: a.email,
                            atletaATelefone: a.telefone ?? "",
                            atletaAPlayId: a.id,
                            atletaAFotoUrl: a.fotoUrl ?? "",
                          }));
                          setBuscaAtletaA("");
                          setResultadosAtletaA([]);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50"
                      >
                        <div className="text-sm font-medium text-slate-900">{a.nome}</div>
                        <div className="text-xs text-slate-600">
                          {a.email}
                          {a.telefone ? ` • ${a.telefone}` : ""}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Nome *</label>
                <input
                  value={form.atletaANome}
                  onChange={(e) => setForm((p) => ({ ...p, atletaANome: e.target.value }))}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Email *</label>
                <input
                  value={form.atletaAEmail}
                  onChange={(e) => setForm((p) => ({ ...p, atletaAEmail: e.target.value }))}
                  type="email"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Telefone</label>
                <input
                  value={form.atletaATelefone}
                  onChange={(e) => setForm((p) => ({ ...p, atletaATelefone: e.target.value }))}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="font-semibold text-slate-900">Atleta 2</div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Buscar atleta</label>
                <input
                  value={buscaAtletaB}
                  onChange={(e) => setBuscaAtletaB(e.target.value)}
                  placeholder="Digite nome ou email…"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                />
                {buscandoAtletaB && <div className="text-xs text-slate-500">Buscando…</div>}
                {resultadosAtletaB.length > 0 && (
                  <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
                    {resultadosAtletaB.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          setForm((p) => ({
                            ...p,
                            atletaBNome: a.nome,
                            atletaBEmail: a.email,
                            atletaBTelefone: a.telefone ?? "",
                            atletaBPlayId: a.id,
                            atletaBFotoUrl: a.fotoUrl ?? "",
                          }));
                          setBuscaAtletaB("");
                          setResultadosAtletaB([]);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50"
                      >
                        <div className="text-sm font-medium text-slate-900">{a.nome}</div>
                        <div className="text-xs text-slate-600">
                          {a.email}
                          {a.telefone ? ` • ${a.telefone}` : ""}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Nome *</label>
                <input
                  value={form.atletaBNome}
                  onChange={(e) => setForm((p) => ({ ...p, atletaBNome: e.target.value }))}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Email *</label>
                <input
                  value={form.atletaBEmail}
                  onChange={(e) => setForm((p) => ({ ...p, atletaBEmail: e.target.value }))}
                  type="email"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Telefone</label>
                <input
                  value={form.atletaBTelefone}
                  onChange={(e) => setForm((p) => ({ ...p, atletaBTelefone: e.target.value }))}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={fecharForm}
              className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!podeSalvar || salvando}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {salvando ? "Salvando…" : "Salvar inscrição"}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-100">
              <th className="py-3 pr-4 font-medium">Dupla</th>
              <th className="py-3 pr-4 font-medium">Status</th>
              <th className="py-3 pr-4 font-medium">Pagamento</th>
              <th className="py-3 pr-4 font-medium">Inscrição</th>
              <th className="py-3 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {carregando && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-500">
                  Carregando…
                </td>
              </tr>
            )}

            {!carregando && inscricoes.length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-slate-500">
                  Nenhuma inscrição encontrada.
                </td>
              </tr>
            )}

            {!carregando &&
              inscricoes.map((i) => (
                <tr key={i.id} className="border-b border-slate-50 hover:bg-slate-50/70">
                  <td className="py-4 pr-4">
                    <div className="flex items-center gap-3">
                      <div className="flex -space-x-2">
                        {i.equipe.atletas.map((a) => (
                          <img
                            key={a.id}
                            className="inline-block h-10 w-10 rounded-full ring-2 ring-white object-cover bg-slate-100"
                            src={a.fotoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(a.nome)}&background=random&color=fff`}
                            alt={a.nome}
                            title={a.nome}
                          />
                        ))}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900">{i.equipe.nome || "Dupla"}</div>
                        <div className="text-xs text-slate-500">
                          {i.equipe.atletas.map((a) => a.nome.split(" ")[0]).join(" & ")}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 pr-4">
                    <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase bg-slate-100 text-slate-700">{i.status}</span>
                  </td>
                  <td className="py-4 pr-4 text-slate-700">A definir</td>
                  <td className="py-4 pr-4 text-slate-700">{new Date(i.dataInscricao).toLocaleString("pt-BR")}</td>
                  <td className="py-4 text-right">
                    <button
                      type="button"
                      onClick={() => onExcluir(i.id)}
                      disabled={excluindoId === i.id}
                      className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      {excluindoId === i.id ? "Excluindo…" : "Excluir"}
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

