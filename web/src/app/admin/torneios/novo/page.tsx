"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
  bannerUrl?: string;
  logoUrl?: string;
  templateUrl?: string;
};

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
  const [form, setForm] = useState<CriarTorneioPayload>({
    nome: "",
    slug: "",
    descricao: "",
    dataInicio: "",
    dataFim: "",
    local: "",
    esporteId: "",
    superCampeonato: false,
    bannerUrl: "",
    logoUrl: "",
    templateUrl: "",
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
      const payload: CriarTorneioPayload = {
        ...form,
        descricao: form.descricao?.trim() ? form.descricao : undefined,
        bannerUrl: form.bannerUrl?.trim() ? form.bannerUrl : undefined,
        logoUrl: form.logoUrl?.trim() ? form.logoUrl : undefined,
        templateUrl: form.templateUrl?.trim() ? form.templateUrl : undefined,
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              label="Template dos Cards"
              value={form.templateUrl}
              onChange={(url) => setForm((prev) => ({ ...prev, templateUrl: url }))}
              folder="campeonatos/templates"
            />
            <p className="text-xs text-slate-500">Recomendado: 1080x1350px (4:5) ou 1080x1080px (1:1)</p>
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
