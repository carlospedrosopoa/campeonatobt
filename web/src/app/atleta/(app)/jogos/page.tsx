"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Trophy } from "lucide-react";
import { isRegrasVoleiSets, type RegrasPartidaConfig, type RegrasPartidaSets } from "@/lib/regras-partida";

type Partida = {
  id: string;
  torneio: { id: string; nome: string; slug: string };
  categoria: { id: string; nome: string };
  fase: string;
  status: string;
  equipeA: { id: string; nome: string | null };
  equipeB: { id: string; nome: string | null };
  placarA: number | null;
  placarB: number | null;
  detalhesPlacar: { set: number; a: number; b: number; tiebreak?: boolean; tbA?: number; tbB?: number }[] | null;
  dataHorario: string | null;
  quadra: string | null;
  meuLado: "A" | "B" | null;
  souCapitao?: boolean;
  souCapitaoDoLado?: "A" | "B" | null;
  placarSubmissaoPendente?: boolean;
  placarSubmissao?: {
    id: string;
    status: "PENDENTE";
    informadoPorUsuarioId: string;
    vencedorId: string | null;
    placarA: number;
    placarB: number;
    detalhesPlacar: { set: number; a: number; b: number; tiebreak?: boolean; tbA?: number; tbB?: number }[];
  } | null;
  regrasPartida?: RegrasPartidaConfig | RegrasPartidaSets | null;
};

type FormPlacar = {
  s1a: string;
  s1b: string;
  s2a: string;
  s2b: string;
  s3a: string;
  s3b: string;
  s4a: string;
  s4b: string;
  s5a: string;
  s5b: string;
};

const emptyFormPlacar = (): FormPlacar => ({
  s1a: "",
  s1b: "",
  s2a: "",
  s2b: "",
  s3a: "",
  s3b: "",
  s4a: "",
  s4b: "",
  s5a: "",
  s5b: "",
});

function formatDataHora(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AtletaJogosPage() {
  const [partidas, setPartidas] = useState<Partida[]>([]);
  const [meuUsuarioId, setMeuUsuarioId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [modal, setModal] = useState<Partida | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [formPlacar, setFormPlacar] = useState<FormPlacar>(emptyFormPlacar);

  async function carregar() {
    try {
      setErro(null);
      setCarregando(true);
      const res = await fetch("/api/v1/atleta/partidas", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(data?.error || "Erro ao carregar jogos");
      setMeuUsuarioId(typeof data?.meuUsuarioId === "string" ? data.meuUsuarioId : null);
      setPartidas((data?.partidas as Partida[]) ?? []);
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar jogos");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  const partidasOrdenadas = useMemo(() => {
    return partidas.slice().sort((a, b) => {
      const da = a.dataHorario ? new Date(a.dataHorario).getTime() : 0;
      const db = b.dataHorario ? new Date(b.dataHorario).getTime() : 0;
      return db - da;
    });
  }, [partidas]);

  function abrirModal(p: Partida) {
    setModal(p);
    const next = emptyFormPlacar();
    const detalhesBase = Array.isArray(p.placarSubmissao?.detalhesPlacar)
      ? p.placarSubmissao?.detalhesPlacar
      : Array.isArray(p.detalhesPlacar)
        ? p.detalhesPlacar
        : [];
    for (const s of detalhesBase) {
      const aKey = `s${s.set}a` as keyof FormPlacar;
      const bKey = `s${s.set}b` as keyof FormPlacar;
      if (aKey in next) next[aKey] = String(s.a ?? "");
      if (bKey in next) next[bKey] = String(s.b ?? "");
    }
    setFormPlacar(next);
  }

  async function limparPlacarPendente(partidaId: string) {
    try {
      setErro(null);
      setSalvando(true);
      const res = await fetch(`/api/v1/atleta/partidas/${partidaId}/placar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ detalhesPlacar: [] }),
      });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(data?.error || "Falha ao limpar placar");
      setModal(null);
      await carregar();
    } catch (e: any) {
      setErro(e?.message || "Erro ao limpar placar");
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarPlacar(partidaId: string) {
    try {
      setErro(null);
      setSalvando(true);
      const res = await fetch(`/api/v1/atleta/partidas/${partidaId}/placar/confirmar`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(data?.error || "Falha ao confirmar placar");
      await carregar();
    } catch (e: any) {
      setErro(e?.message || "Erro ao confirmar placar");
    } finally {
      setSalvando(false);
    }
  }

  async function recusarPlacar(partidaId: string) {
    try {
      setErro(null);
      setSalvando(true);
      const res = await fetch(`/api/v1/atleta/partidas/${partidaId}/placar/recusar`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(data?.error || "Falha ao recusar placar");
      await carregar();
    } catch (e: any) {
      setErro(e?.message || "Erro ao recusar placar");
    } finally {
      setSalvando(false);
    }
  }

  async function enviarPlacar() {
    if (!modal) return;
    const detalhes: Array<{ set: number; a: number; b: number }> = [];
    const regras = modal.regrasPartida;
    const campos = [
      { a: formPlacar.s1a.trim(), b: formPlacar.s1b.trim() },
      { a: formPlacar.s2a.trim(), b: formPlacar.s2b.trim() },
      { a: formPlacar.s3a.trim(), b: formPlacar.s3b.trim() },
      { a: formPlacar.s4a.trim(), b: formPlacar.s4b.trim() },
      { a: formPlacar.s5a.trim(), b: formPlacar.s5b.trim() },
    ];

    if (isRegrasVoleiSets(regras)) {
      let encontrouSetVazio = false;
      for (let index = 0; index < regras.melhorDe; index += 1) {
        const atual = campos[index];
        const ambosVazios = !atual.a && !atual.b;
        if (ambosVazios) {
          encontrouSetVazio = true;
          continue;
        }
        if (!atual.a || !atual.b) {
          setErro(`Informe o placar completo do set ${index + 1}.`);
          return;
        }
        if (encontrouSetVazio) {
          setErro("Preencha os sets em ordem, sem pular placares.");
          return;
        }
        detalhes.push({ set: index + 1, a: Number(atual.a), b: Number(atual.b) });
      }

      if (detalhes.length === 0) {
        setErro("Informe pelo menos o set 1.");
        return;
      }
    } else {
      const melhorDe = regras?.melhorDe ?? 1;
      const set1 = campos[0];
      if (!set1.a || !set1.b) {
        setErro("Informe o placar do set 1.");
        return;
      }
      detalhes.push({ set: 1, a: Number(set1.a), b: Number(set1.b) });

      if (melhorDe === 3) {
        const set2 = campos[1];
        if (!set2.a || !set2.b) {
          setErro("Informe o placar do set 2.");
          return;
        }
        detalhes.push({ set: 2, a: Number(set2.a), b: Number(set2.b) });

        if (campos[2].a || campos[2].b) {
          if (!campos[2].a || !campos[2].b) {
            setErro("Informe o placar completo do set 3.");
            return;
          }
          detalhes.push({ set: 3, a: Number(campos[2].a), b: Number(campos[2].b) });
        }
      }
    }

    try {
      setErro(null);
      setSalvando(true);
      const res = await fetch(`/api/v1/atleta/partidas/${modal.id}/placar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ detalhesPlacar: detalhes }),
      });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(data?.error || "Falha ao enviar placar");
      alert("Placar enviado. Aguardando confirmação do capitão adversário.");
      setModal(null);
      await carregar();
    } catch (e: any) {
      setErro(e?.message || "Erro ao enviar placar");
    } finally {
      setSalvando(false);
    }
  }

  const modalCampos = useMemo(() => {
    if (!modal) return [];
    const regras = modal.regrasPartida;
    const quantidadeSets = isRegrasVoleiSets(regras) ? regras.melhorDe : (regras?.melhorDe ?? 1);
    return Array.from({ length: quantidadeSets }, (_, index) => ({
      set: index + 1,
      label:
        isRegrasVoleiSets(regras) && regras.tieBreakDecisivo?.habilitado && index + 1 === quantidadeSets
          ? `Set ${index + 1} (tie-break)`
          : `Set ${index + 1}`,
      aKey: `s${index + 1}a` as keyof FormPlacar,
      bKey: `s${index + 1}b` as keyof FormPlacar,
    }));
  }, [modal]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-100">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Trophy className="h-6 w-6 text-orange-500" />
            <div>
              <div className="font-bold text-slate-900">Meus jogos</div>
              <div className="text-xs text-slate-500">Capitão da dupla vencedora informa o placar e o capitão adversário confirma.</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/atleta/perfil" className="text-sm font-semibold text-slate-700 hover:text-slate-900">
              Meu perfil
            </Link>
            <Link href="/atleta/torneios" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-4">
        {erro && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}

        {carregando ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-40 rounded-xl bg-white border border-slate-100 animate-pulse" />
            ))}
          </div>
        ) : partidasOrdenadas.length === 0 ? (
          <div className="rounded-xl bg-white border border-slate-100 p-8 text-center text-slate-500">
            Nenhum jogo encontrado para o seu usuário.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {partidasOrdenadas.map((p) => (
              <div key={p.id} className="rounded-xl bg-white border border-slate-100 shadow-sm p-5 space-y-3">
                <div className="text-xs font-semibold text-slate-500">{p.torneio.nome} • {p.categoria.nome}</div>
                <div className="text-sm font-bold text-slate-900">{p.equipeA.nome || "Equipe A"} x {p.equipeB.nome || "Equipe B"}</div>
                <div className="text-xs text-slate-600">
                  {formatDataHora(p.dataHorario) || "Horário a definir"}{p.quadra ? ` • Q. ${p.quadra}` : ""} • {p.status}
                </div>
                {(p.detalhesPlacar?.length || 0) > 0 && (
                  <div className="text-xs font-semibold text-slate-700">
                    Placar: {(p.placarA ?? 0)} x {(p.placarB ?? 0)}
                  </div>
                )}
                <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
                  <Link
                    href={`/torneios/${p.torneio.slug}`}
                    className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                  >
                    Ver torneio
                  </Link>
                  {(() => {
                    const temPlacar =
                      (p.detalhesPlacar?.length || 0) > 0 || p.status === "FINALIZADA" || p.status === "WO";
                    const pendente = p.placarSubmissaoPendente && p.placarSubmissao?.status === "PENDENTE" ? p.placarSubmissao : null;
                    const informadoPorMim = Boolean(pendente && meuUsuarioId && pendente.informadoPorUsuarioId === meuUsuarioId);
                    const souCapitao = Boolean(p.souCapitao);
                    const podeInformar =
                      !temPlacar && !pendente && souCapitao && (p.status === "AGENDADA" || p.status === "EM_ANDAMENTO");
                    const podeEditar = !temPlacar && pendente && informadoPorMim && souCapitao;
                    const podeConfirmar = !temPlacar && pendente && !informadoPorMim && souCapitao;

                    if (temPlacar) {
                      return (
                        <span className="rounded-md bg-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-800">
                          Placar confirmado
                        </span>
                      );
                    }

                    if (podeConfirmar) {
                      return (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => confirmarPlacar(p.id)}
                            disabled={salvando}
                            className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            Confirmar
                          </button>
                          <button
                            type="button"
                            onClick={() => recusarPlacar(p.id)}
                            disabled={salvando}
                            className="rounded-md bg-white px-3 py-2 text-xs font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                          >
                            Recusar
                          </button>
                        </div>
                      );
                    }

                    if (podeEditar) {
                      return (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => abrirModal(p)}
                            disabled={salvando}
                            className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => limparPlacarPendente(p.id)}
                            disabled={salvando}
                            className="rounded-md bg-white px-3 py-2 text-xs font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                          >
                            Zerar
                          </button>
                          <span className="rounded-md bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-800">
                            Aguardando confirmação
                          </span>
                        </div>
                      );
                    }

                    if (pendente) {
                      return (
                        <span className="rounded-md bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-800">
                          Aguardando confirmação
                        </span>
                      );
                    }

                    if (podeInformar) {
                      return (
                        <button
                          type="button"
                          onClick={() => abrirModal(p)}
                          className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                        >
                          Informar placar
                        </button>
                      );
                    }

                    return null;
                  })()}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-lg rounded-xl bg-white border border-slate-200 shadow-xl p-6 space-y-4">
            <div>
              <div className="text-sm font-semibold text-slate-500">{modal.torneio.nome} • {modal.categoria.nome}</div>
              <div className="text-lg font-bold text-slate-900">{modal.equipeA.nome || "Equipe A"} x {modal.equipeB.nome || "Equipe B"}</div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-sm font-semibold text-slate-700">
              <div />
              <div className="text-center">{modal.equipeA.nome || "Equipe A"}</div>
              <div className="text-center">{modal.equipeB.nome || "Equipe B"}</div>
            </div>

            <div className="grid grid-cols-3 gap-2 items-center">
              {modalCampos.map((campo) => (
                <div key={campo.aKey} className="contents">
                  <div className="text-sm text-slate-600">{campo.label}</div>
                  <input
                    value={formPlacar[campo.aKey]}
                    onChange={(e) => setFormPlacar((prev) => ({ ...prev, [campo.aKey]: e.target.value }))}
                    type="number"
                    className="rounded-md border border-slate-200 px-3 py-2 text-sm text-center"
                  />
                  <input
                    value={formPlacar[campo.bKey]}
                    onChange={(e) => setFormPlacar((prev) => ({ ...prev, [campo.bKey]: e.target.value }))}
                    type="number"
                    className="rounded-md border border-slate-200 px-3 py-2 text-sm text-center"
                  />
                </div>
              ))}
            </div>

            <div className="text-xs text-slate-500">
              {isRegrasVoleiSets(modal.regrasPartida)
                ? "Preencha os sets em ordem. Ao enviar, o placar ficará pendente até o capitão adversário confirmar."
                : "Ao enviar, o placar ficará pendente até o capitão adversário confirmar."}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                disabled={salvando}
                className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={enviarPlacar}
                disabled={salvando}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {salvando ? "Enviando..." : "Enviar para confirmação"}
              </button>
            </div>

            {Boolean(modal.placarSubmissao && meuUsuarioId && modal.placarSubmissao.informadoPorUsuarioId === meuUsuarioId) && (
              <button
                type="button"
                onClick={() => limparPlacarPendente(modal.id)}
                disabled={salvando}
                className="w-full rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Zerar placar pendente
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
