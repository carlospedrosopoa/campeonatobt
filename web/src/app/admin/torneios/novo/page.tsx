"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { ImageUpload } from "@/components/ui/image-upload";

type Esporte = {
  id: string;
  nome: string;
  slug: string;
};

type CriarTorneioPayload = {
  nome: string;
  slug: string;
  descricao?: string;
  dataInicio: string;
  dataFim: string;
  local: string;
  esporteId: string;
  superCampeonato?: boolean;
  oculto?: boolean;
  inscricaoComIa?: boolean;
  valorPrimeiraInscricao?: string | null;
  valorInscricaoAdicional?: string | null;
  pixChave?: string | null;
  pixNome?: string | null;
  pixCidade?: string | null;
  camisetaOpcoes?: string[] | null;
  bannerUrl?: string;
  logoUrl?: string;
  templateUrl?: string;
  templateInscricaoUrl?: string;
};

type TorneioForm = Omit<CriarTorneioPayload, "camisetaOpcoes"> & { camisetaOpcoesTexto: string };

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export default function AdminNovoTorneioPage() {
  const router = useRouter();
  const [esportes, setEsportes] = useState<Esporte[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [slugManual, setSlugManual] = useState(false);
  const [form, setForm] = useState<TorneioForm>({
    nome: "",
    slug: "",
    descricao: "",
    dataInicio: "",
    dataFim: "",
    local: "",
    esporteId: "",
    superCampeonato: false,
    oculto: false,
    inscricaoComIa: false,
    valorPrimeiraInscricao: "",
    valorInscricaoAdicional: "",
    pixChave: "",
    pixNome: "",
    pixCidade: "",
    camisetaOpcoesTexto: "",
    bannerUrl: "",
    logoUrl: "",
    templateUrl: "",
    templateInscricaoUrl: "",
  });

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      try {
        setCarregando(true);
        const res = await fetch("/api/v1/esportes", { cache: "no-store" });
        if (!res.ok) throw new Error("Falha ao carregar esportes");
        const dados = (await res.json()) as Esporte[];
        if (!ativo) return;
        setEsportes(dados);
        setForm((prev) => ({
          ...prev,
          esporteId: prev.esporteId || dados.find((e) => e.slug === "beach-tennis")?.id || dados[0]?.id || "",
        }));
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
  }, []);

  const podeSalvar = useMemo(() => {
    return Boolean(form.nome && form.slug && form.dataInicio && form.dataFim && form.local && form.esporteId);
  }, [form]);

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
      const payload: CriarTorneioPayload = {
        nome: form.nome,
        slug: form.slug,
        descricao: form.descricao?.trim() ? form.descricao : undefined,
        dataInicio: form.dataInicio,
        dataFim: form.dataFim,
        local: form.local,
        esporteId: form.esporteId,
        superCampeonato: form.superCampeonato,
        oculto: form.oculto,
        inscricaoComIa: form.inscricaoComIa,
        valorPrimeiraInscricao: form.valorPrimeiraInscricao?.trim() ? form.valorPrimeiraInscricao : null,
        valorInscricaoAdicional: form.valorInscricaoAdicional?.trim() ? form.valorInscricaoAdicional : null,
        pixChave: form.pixChave?.trim() ? form.pixChave : null,
        pixNome: form.pixNome?.trim() ? form.pixNome : null,
        pixCidade: form.pixCidade?.trim() ? form.pixCidade : null,
        camisetaOpcoes: camisetaOpcoes.length > 0 ? camisetaOpcoes : null,
        bannerUrl: form.bannerUrl?.trim() ? form.bannerUrl : undefined,
        logoUrl: form.logoUrl?.trim() ? form.logoUrl : undefined,
        templateUrl: form.templateUrl?.trim() ? form.templateUrl : undefined,
        templateInscricaoUrl: form.templateInscricaoUrl?.trim() ? form.templateInscricaoUrl : undefined,
      };

      const res = await fetch("/api/v1/torneios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.error || "Falha ao criar torneio");
      }

      const novo = (await res.json()) as { slug: string };
      router.push(`/admin/torneios/${novo.slug}`);
      router.refresh();
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
    } finally {
      setSalvando(false);
    }
  }

  function onChangeNome(nome: string) {
    setForm((prev) => {
      const next = { ...prev, nome };
      if (!slugManual) next.slug = slugify(nome);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Link href="/admin/torneios" className="inline-flex items-center gap-2 hover:text-slate-900">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">Novo torneio</h1>
          <p className="text-sm text-slate-600">Cadastre as informações básicas do evento.</p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-6">
        {erro && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Nome *</label>
            <input
              value={form.nome}
              onChange={(e) => onChangeNome(e.target.value)}
              placeholder="Ex: Brasileirão - 8ª Temporada"
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
              placeholder="brasileirao-8a-temporada"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Esporte *</label>
            <select
              value={form.esporteId}
              disabled={carregando}
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
            <label className="text-sm font-medium text-slate-700">Local *</label>
            <input
              value={form.local}
              onChange={(e) => setForm((prev) => ({ ...prev, local: e.target.value }))}
              placeholder="Ex: Arena Beach Club - São Paulo"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
            />
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
              value={form.valorPrimeiraInscricao ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, valorPrimeiraInscricao: e.target.value }))}
              type="number"
              step="0.01"
              min="0"
              placeholder="0,00"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Valor inscrição adicional (por atleta)</label>
            <input
              value={form.valorInscricaoAdicional ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, valorInscricaoAdicional: e.target.value }))}
              type="number"
              step="0.01"
              min="0"
              placeholder="0,00"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Chave PIX</label>
            <input
              value={form.pixChave ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, pixChave: e.target.value }))}
              placeholder="CPF, email, telefone, EVP…"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Nome PIX</label>
            <input
              value={form.pixNome ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, pixNome: e.target.value }))}
              placeholder="Nome do recebedor"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Cidade PIX</label>
            <input
              value={form.pixCidade ?? ""}
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
            <div className="text-xs text-slate-500">Use enquanto organiza o evento. Depois é só desmarcar.</div>
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
            <div className="text-xs text-slate-500">Quando marcado, o torneio pode aparecer no fluxo do agente e exibe o chat público de inscrição no site.</div>
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
            placeholder="Texto institucional do torneio…"
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
            <p className="text-xs text-slate-500">Usado nos cards de dupla confirmada. Mesmo formato recomendado do template dos jogos.</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            href="/admin/torneios"
            className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={!podeSalvar || salvando}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {salvando ? "Salvando…" : "Criar torneio"}
          </button>
        </div>
      </form>
    </div>
  );
}
