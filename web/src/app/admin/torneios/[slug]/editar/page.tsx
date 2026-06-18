"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Save, Trash2 } from "lucide-react";
import { ImageUpload } from "@/components/ui/image-upload";

type Esporte = {
  id: string;
  nome: string;
  slug: string;
};

type Torneio = {
  id: string;
  nome: string;
  slug: string;
  descricao: string | null;
  dataInicio: string;
  dataFim: string;
  local: string;
  status: "RASCUNHO" | "ABERTO" | "EM_ANDAMENTO" | "FINALIZADO" | "CANCELADO";
  superCampeonato: boolean;
  cardApenasComFotos: boolean;
  oculto: boolean;
  inscricaoComIa: boolean;
  valorPrimeiraInscricao: string | null;
  valorInscricaoAdicional: string | null;
  pixChave: string | null;
  pixNome: string | null;
  pixCidade: string | null;
  camisetaOpcoes: string[] | null;
  bannerUrl: string | null;
  logoUrl: string | null;
  templateUrl: string | null;
  templateInscricaoUrl: string | null;
  organizadorId: string;
  esporteId: string | null;
  esporteNome: string | null;
};

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export default function AdminEditarDadosTorneioPage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slugAtual = params.slug;

  const [esportes, setEsportes] = useState<Esporte[]>([]);
  const [torneio, setTorneio] = useState<Torneio | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [slugManual, setSlugManual] = useState(false);

  const [form, setForm] = useState({
    nome: "",
    slug: "",
    descricao: "",
    dataInicio: "",
    dataFim: "",
    local: "",
    esporteId: "",
    bannerUrl: "",
    logoUrl: "",
    templateUrl: "",
    templateInscricaoUrl: "",
    status: "RASCUNHO" as Torneio["status"],
    superCampeonato: false,
    cardApenasComFotos: false,
    oculto: false,
    inscricaoComIa: false,
    valorPrimeiraInscricao: "",
    valorInscricaoAdicional: "",
    pixChave: "",
    pixNome: "",
    pixCidade: "",
    camisetaOpcoesTexto: "",
  });

  useEffect(() => {
    let ativo = true;

    async function carregar() {
      try {
        setCarregando(true);
        setErro(null);

        const [resT, resE] = await Promise.all([
          fetch(`/api/v1/torneios/${slugAtual}`, { cache: "no-store" }),
          fetch("/api/v1/esportes", { cache: "no-store" }),
        ]);

        if (!resT.ok) {
          const msg = await resT.json().catch(() => null);
          throw new Error(msg?.error || "Falha ao carregar torneio");
        }
        if (!resE.ok) throw new Error("Falha ao carregar esportes");

        const t = (await resT.json()) as Torneio;
        const e = (await resE.json()) as Esporte[];

        if (!ativo) return;

        setTorneio(t);
        setEsportes(e);
        setForm({
          nome: t.nome,
          slug: t.slug,
          descricao: t.descricao ?? "",
          dataInicio: t.dataInicio,
          dataFim: t.dataFim,
          local: t.local,
          esporteId: t.esporteId ?? e[0]?.id ?? "",
          bannerUrl: t.bannerUrl ?? "",
          logoUrl: t.logoUrl ?? "",
          templateUrl: t.templateUrl ?? "",
          templateInscricaoUrl: t.templateInscricaoUrl ?? "",
          status: t.status,
          superCampeonato: Boolean(t.superCampeonato),
          cardApenasComFotos: Boolean(t.cardApenasComFotos),
          oculto: Boolean(t.oculto),
          inscricaoComIa: Boolean(t.inscricaoComIa),
          valorPrimeiraInscricao: t.valorPrimeiraInscricao ?? "",
          valorInscricaoAdicional: t.valorInscricaoAdicional ?? "",
          pixChave: t.pixChave ?? "",
          pixNome: t.pixNome ?? "",
          pixCidade: t.pixCidade ?? "",
          camisetaOpcoesTexto: (t.camisetaOpcoes ?? []).join("\n"),
        });
      } catch (e: any) {
        if (ativo) setErro(e?.message || "Erro inesperado");
      } finally {
        if (ativo) setCarregando(false);
      }
    }

    void carregar();
    return () => {
      ativo = false;
    };
  }, [slugAtual]);

  const podeSalvar = useMemo(() => {
    return Boolean(form.nome && form.slug && form.dataInicio && form.dataFim && form.local && form.esporteId);
  }, [form]);

  function onChangeNome(nome: string) {
    setForm((prev) => {
      const next = { ...prev, nome };
      if (!slugManual) next.slug = slugify(nome);
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (!podeSalvar) {
      setErro("Preencha os campos obrigatórios.");
      return;
    }

    try {
      setSalvando(true);
      const camisetaOpcoes = form.camisetaOpcoesTexto
        .split(/\r?\n/g)
        .map((s) => s.trim())
        .filter(Boolean);
      const payload = {
        nome: form.nome,
        slug: form.slug,
        descricao: form.descricao?.trim() ? form.descricao : null,
        dataInicio: form.dataInicio,
        dataFim: form.dataFim,
        local: form.local,
        esporteId: form.esporteId,
        bannerUrl: form.bannerUrl?.trim() ? form.bannerUrl : null,
        logoUrl: form.logoUrl?.trim() ? form.logoUrl : null,
        templateUrl: form.templateUrl?.trim() ? form.templateUrl : null,
        templateInscricaoUrl: form.templateInscricaoUrl?.trim() ? form.templateInscricaoUrl : null,
        status: form.status,
        superCampeonato: form.superCampeonato,
        cardApenasComFotos: form.cardApenasComFotos,
        oculto: form.oculto,
        inscricaoComIa: form.inscricaoComIa,
        valorPrimeiraInscricao: form.valorPrimeiraInscricao?.trim() ? form.valorPrimeiraInscricao : null,
        valorInscricaoAdicional: form.valorInscricaoAdicional?.trim() ? form.valorInscricaoAdicional : null,
        pixChave: form.pixChave?.trim() ? form.pixChave : null,
        pixNome: form.pixNome?.trim() ? form.pixNome : null,
        pixCidade: form.pixCidade?.trim() ? form.pixCidade : null,
        camisetaOpcoes: camisetaOpcoes.length > 0 ? camisetaOpcoes : null,
      };

      const res = await fetch(`/api/v1/torneios/${slugAtual}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.error || "Falha ao salvar alterações");
      }

      const atualizado = (await res.json()) as Torneio;

      if (atualizado.slug !== slugAtual) {
        router.replace(`/admin/torneios/${atualizado.slug}/editar`);
      }

      setTorneio(atualizado);
      router.refresh();
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    } finally {
      setSalvando(false);
    }
  }

  async function onExcluir() {
    setErro(null);
    const ok = window.confirm("Deseja excluir este torneio? Essa ação não pode ser desfeita.");
    if (!ok) return;

    try {
      setExcluindo(true);
      const res = await fetch(`/api/v1/torneios/${slugAtual}`, { method: "DELETE" });
      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.error || "Falha ao excluir torneio");
      }
      router.push("/admin/torneios");
      router.refresh();
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href={`/admin/torneios/${slugAtual}`} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao dashboard
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">Editar dados do torneio</h1>
          <p className="text-sm text-slate-600">Atualize informações básicas e status.</p>
        </div>
        {torneio && (
          <Link
            href={`/torneios/${torneio.slug}`}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <ExternalLink className="h-4 w-4" />
            Abrir público
          </Link>
        )}
      </div>

      {carregando && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 text-slate-600">Carregando…</div>
      )}

      {!carregando && !torneio && erro && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 text-red-600">{erro}</div>
      )}

      {!carregando && torneio && (
        <form onSubmit={onSubmit} className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-6">
          {erro && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Nome *</label>
              <input
                value={form.nome}
                onChange={(e) => onChangeNome(e.target.value)}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Slug *</label>
              <input
                value={form.slug}
                onChange={(e) => {
                  setSlugManual(true);
                  setForm((prev) => ({ ...prev, slug: slugify(e.target.value) }));
                }}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Esporte *</label>
              <select
                value={form.esporteId}
                onChange={(e) => setForm((prev) => ({ ...prev, esporteId: e.target.value }))}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 bg-white"
              >
                {esportes.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Status *</label>
              <select
                value={form.status}
                onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as Torneio["status"] }))}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 bg-white"
              >
                <option value="RASCUNHO">RASCUNHO</option>
                <option value="ABERTO">ABERTO</option>
                <option value="EM_ANDAMENTO">EM_ANDAMENTO</option>
                <option value="FINALIZADO">FINALIZADO</option>
                <option value="CANCELADO">CANCELADO</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Modelo</label>
              <select
                value={form.superCampeonato ? "SUPER" : "NORMAL"}
                onChange={(e) => setForm((prev) => ({ ...prev, superCampeonato: e.target.value === "SUPER" }))}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 bg-white"
              >
                <option value="NORMAL">Normal</option>
                <option value="SUPER">Super Campeonato</option>
              </select>
              <div className="text-xs text-slate-500">A classificação usa pontuação especial no Super Campeonato.</div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Valor 1ª inscrição (por atleta)</label>
              <input
                value={form.valorPrimeiraInscricao}
                onChange={(e) => setForm((prev) => ({ ...prev, valorPrimeiraInscricao: e.target.value }))}
                type="number"
                step="0.01"
                min="0"
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Valor inscrição adicional (por atleta)</label>
              <input
                value={form.valorInscricaoAdicional}
                onChange={(e) => setForm((prev) => ({ ...prev, valorInscricaoAdicional: e.target.value }))}
                type="number"
                step="0.01"
                min="0"
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Chave PIX</label>
              <input
                value={form.pixChave}
                onChange={(e) => setForm((prev) => ({ ...prev, pixChave: e.target.value }))}
                placeholder="CPF, email, telefone, EVP…"
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Nome PIX</label>
              <input
                value={form.pixNome}
                onChange={(e) => setForm((prev) => ({ ...prev, pixNome: e.target.value }))}
                placeholder="Nome do recebedor"
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Cidade PIX</label>
              <input
                value={form.pixCidade}
                onChange={(e) => setForm((prev) => ({ ...prev, pixCidade: e.target.value }))}
                placeholder="Ex: PORTO ALEGRE"
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-slate-700">Opções de camiseta (uma por linha)</label>
              <textarea
                value={form.camisetaOpcoesTexto}
                onChange={(e) => setForm((prev) => ({ ...prev, camisetaOpcoesTexto: e.target.value }))}
                rows={4}
                placeholder={"Ex:\nBaby Look M\nCamiseta M\nRegata G"}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Visibilidade</label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={Boolean(form.oculto)}
                  onChange={(e) => setForm((prev) => ({ ...prev, oculto: e.target.checked }))}
                />
                Oculto (não aparece para usuários)
              </label>
              <div className="text-xs text-slate-500">Quando marcado, o torneio não aparece no site público.</div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Inscrição com IA</label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={Boolean(form.inscricaoComIa)}
                  onChange={(e) => setForm((prev) => ({ ...prev, inscricaoComIa: e.target.checked }))}
                />
                Habilitar atendimento virtual com IA neste torneio
              </label>
              <div className="text-xs text-slate-500">Controla a exibição do chat público e se o agente pode atender inscrições deste torneio.</div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Card dos jogos</label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={Boolean(form.cardApenasComFotos)}
                  onChange={(e) => setForm((prev) => ({ ...prev, cardApenasComFotos: e.target.checked }))}
                />
                Card apenas com fotos
              </label>
              <div className="text-xs text-slate-500">Quando marcado, o card do jogo não mostra categoria, data nem arena.</div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Local *</label>
              <input
                value={form.local}
                onChange={(e) => setForm((prev) => ({ ...prev, local: e.target.value }))}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Data início *</label>
              <input
                type="date"
                value={form.dataInicio}
                onChange={(e) => setForm((prev) => ({ ...prev, dataInicio: e.target.value }))}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Data fim *</label>
              <input
                type="date"
                value={form.dataFim}
                onChange={(e) => setForm((prev) => ({ ...prev, dataFim: e.target.value }))}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Descrição</label>
            <textarea
              value={form.descricao}
              onChange={(e) => setForm((prev) => ({ ...prev, descricao: e.target.value }))}
              rows={5}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="space-y-2">
              <ImageUpload
                label="Banner do Torneio"
                value={form.bannerUrl}
                onChange={(url) => setForm((prev) => ({ ...prev, bannerUrl: url }))}
              folder="campeonatos/banners"
            />
            <p className="text-xs text-slate-500">Recomendado: 1920x480px (4:1). As laterais serão cortadas no mobile.</p>
          </div>
          <div className="space-y-2">
            <ImageUpload
              label="Logo do Torneio"
              value={form.logoUrl}
              onChange={(url) => setForm((prev) => ({ ...prev, logoUrl: url }))}
              folder="campeonatos/logos"
            />
            <p className="text-xs text-slate-500">Recomendado: 500x500px (Quadrado/Círculo)</p>
          </div>
          <div className="space-y-2">
            <ImageUpload
              label="Template dos Cards de Jogos"
              value={form.templateUrl}
              onChange={(url) => setForm((prev) => ({ ...prev, templateUrl: url }))}
              folder="campeonatos/templates"
            />
            <p className="text-xs text-slate-500">Recomendado: 1080x1350px (4:5) ou 1080x1080px (1:1)</p>
          </div>
          <div className="space-y-2">
            <ImageUpload
              label="Template dos Cards de Inscrição"
              value={form.templateInscricaoUrl}
              onChange={(url) => setForm((prev) => ({ ...prev, templateInscricaoUrl: url }))}
              folder="campeonatos/templates"
            />
            <p className="text-xs text-slate-500">Usado no card de dupla confirmada e demais cards de inscrição.</p>
          </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={onExcluir}
              disabled={excluindo}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              {excluindo ? "Excluindo…" : "Excluir"}
            </button>

            <button
              type="submit"
              disabled={!podeSalvar || salvando}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {salvando ? "Salvando…" : "Salvar alterações"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
