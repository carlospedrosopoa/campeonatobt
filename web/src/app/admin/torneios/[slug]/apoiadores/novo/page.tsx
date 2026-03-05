"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, MapPin } from "lucide-react";
import { ImageUpload } from "@/components/ui/image-upload";

export default function AdminNovoApoiadorPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params.slug;

  const [form, setForm] = useState({
    nome: "",
    logoUrl: "",
    slogan: "",
    endereco: "",
    latitude: "",
    longitude: "",
    siteUrl: "",
  });

  const [salvando, setSalvando] = useState(false);
  const [buscandoGeo, setBuscandoGeo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function buscarGeolocalizacao() {
    if (!form.endereco) {
      alert("Digite um endereço para buscar.");
      return;
    }
    setBuscandoGeo(true);
    try {
      const res = await fetch(`/api/geocode?endereco=${encodeURIComponent(form.endereco)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensagem || "Erro ao buscar localização");

      setForm(prev => ({
        ...prev,
        latitude: String(data.latitude),
        longitude: String(data.longitude),
        endereco: data.enderecoCompleto || prev.endereco // Atualiza com o endereço formatado se quiser
      }));
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBuscandoGeo(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome) return;

    setSalvando(true);
    try {
      const res = await fetch(`/api/v1/torneios/${slug}/apoiadores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const msg = await res.json();
        throw new Error(msg.error || "Erro ao salvar");
      }

      router.push(`/admin/torneios/${slug}/apoiadores`);
      router.refresh();
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/admin/torneios/${slug}/apoiadores`} className="text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Novo Apoiador</h1>
      </div>

      {erro && <div className="text-red-600 bg-red-50 p-3 rounded-md">{erro}</div>}

      <form onSubmit={onSubmit} className="bg-white rounded-xl border border-slate-100 p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Nome *</label>
              <input
                value={form.nome}
                onChange={e => setForm(prev => ({ ...prev, nome: e.target.value }))}
                className="w-full mt-1 rounded-md border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Slogan</label>
              <input
                value={form.slogan}
                onChange={e => setForm(prev => ({ ...prev, slogan: e.target.value }))}
                className="w-full mt-1 rounded-md border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Site URL</label>
              <input
                value={form.siteUrl}
                onChange={e => setForm(prev => ({ ...prev, siteUrl: e.target.value }))}
                className="w-full mt-1 rounded-md border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 outline-none"
                placeholder="https://..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Endereço</label>
              <div className="flex gap-2 mt-1">
                <input
                  value={form.endereco}
                  onChange={e => setForm(prev => ({ ...prev, endereco: e.target.value }))}
                  className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 outline-none"
                  placeholder="Rua, Número, Cidade..."
                />
                <button
                  type="button"
                  onClick={buscarGeolocalizacao}
                  disabled={buscandoGeo}
                  className="px-3 py-2 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 disabled:opacity-50"
                  title="Buscar Geolocalização"
                >
                  {buscandoGeo ? "..." : <MapPin className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Latitude</label>
                <input
                  value={form.latitude}
                  onChange={e => setForm(prev => ({ ...prev, latitude: e.target.value }))}
                  className="w-full mt-1 rounded-md border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 outline-none"
                  placeholder="-23.5505"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Longitude</label>
                <input
                  value={form.longitude}
                  onChange={e => setForm(prev => ({ ...prev, longitude: e.target.value }))}
                  className="w-full mt-1 rounded-md border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 outline-none"
                  placeholder="-46.6333"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <ImageUpload
              label="Logo"
              value={form.logoUrl}
              onChange={url => setForm(prev => ({ ...prev, logoUrl: url }))}
              folder="campeonatos/apoiadores"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <Link
            href={`/admin/torneios/${slug}/apoiadores`}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={salvando}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-orange-500 rounded-md hover:bg-orange-600 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}
