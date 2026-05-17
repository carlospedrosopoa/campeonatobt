"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, FileUp, RefreshCw, Save } from "lucide-react";

type Categoria = {
  id: string;
  nome: string;
  genero: "MASCULINO" | "FEMININO" | "MISTO";
};

type AtletaRef = { nomeOriginal: string; nomeNormalizado: string };

type PreviewJogo = {
  rodadaNome: string;
  rodadaNumero: number | null;
  dataLimiteTexto: string | null;
  duplaA: { texto: string; atletas: AtletaRef[] };
  duplaB: { texto: string; atletas: AtletaRef[] };
  arenaNome: string | null;
  dataHorarioTexto: string | null;
  placarTexto: string | null;
  warnings: string[];
};

type Preview = {
  sheetName: string;
  atletas: AtletaRef[];
  arenas: string[];
  rodadas: Array<{ nome: string; numero: number | null; dataLimiteTexto: string | null; jogos: PreviewJogo[] }>;
  totalJogos: number;
  warnings: string[];
};

type PlayAtleta = { id: string; nome: string; email: string; telefone?: string | null; fotoUrl?: string | null };

type ImportResult = {
  torneio: { id: string; nome: string; slug: string };
  categoria: { id: string; nome: string; genero: string; slug: string };
  counters: Record<string, number | boolean>;
  warnings: string[];
};

function storageKey(slug: string) {
  return `superImport:mapeamento:${slug}`;
}

function readStoredMapping(slug: string) {
  try {
    const raw = localStorage.getItem(storageKey(slug));
    const obj = raw ? JSON.parse(raw) : null;
    if (!obj || typeof obj !== "object") return {};
    return obj as Record<string, { playAtletaId: string; nome?: string; email?: string }>;
  } catch {
    return {};
  }
}

function writeStoredMapping(slug: string, value: Record<string, { playAtletaId: string; nome?: string; email?: string }>) {
  try {
    localStorage.setItem(storageKey(slug), JSON.stringify(value));
  } catch {}
}

function AtletaMapRow(props: {
  slug: string;
  atleta: AtletaRef;
  value?: { playAtletaId: string; nome?: string; email?: string } | null;
  onChange: (next: { playAtletaId: string; nome?: string; email?: string } | null) => void;
}) {
  const { slug, atleta, value, onChange } = props;
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<PlayAtleta[]>([]);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/v1/admin/playnaquadra/atletas?q=${encodeURIComponent(query)}&limit=8`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setResults((data?.atletas || []) as PlayAtleta[]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [q]);

  async function autoSugerir() {
    const query = atleta.nomeOriginal.trim();
    if (query.length < 2) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/v1/admin/playnaquadra/atletas?q=${encodeURIComponent(query)}&limit=5`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const first = (data?.atletas || [])[0] as PlayAtleta | undefined;
      if (!first?.id) return;
      onChange({ playAtletaId: first.id, nome: first.nome, email: first.email });
      const merged = { ...readStoredMapping(slug), [atleta.nomeNormalizado]: { playAtletaId: first.id, nome: first.nome, email: first.email } };
      writeStoredMapping(slug, merged);
    } finally {
      setLoading(false);
      setQ("");
      setResults([]);
    }
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-slate-900">{atleta.nomeOriginal}</div>
          <div className="text-xs text-slate-500">{atleta.nomeNormalizado}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={autoSugerir}
            className="rounded-md border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
            disabled={loading}
          >
            Sugerir
          </button>
          {value?.playAtletaId && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                const current = readStoredMapping(slug);
                delete current[atleta.nomeNormalizado];
                writeStoredMapping(slug, current);
              }}
              className="rounded-md border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      {value?.playAtletaId ? (
        <div className="mt-2 rounded-md bg-emerald-50 px-3 py-2">
          <div className="text-xs text-emerald-800">
            Vinculado: <span className="font-medium">{value.nome || value.playAtletaId}</span>
            {value.email ? ` • ${value.email}` : ""}
          </div>
        </div>
      ) : (
        <div className="mt-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar no Play por nome ou email…"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
          />
          {loading && <div className="mt-1 text-xs text-slate-500">Buscando…</div>}
          {results.length > 0 && (
            <div className="mt-2 rounded-md border border-slate-200 bg-white overflow-hidden">
              {results.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    onChange({ playAtletaId: a.id, nome: a.nome, email: a.email });
                    setQ("");
                    setResults([]);
                    const merged = { ...readStoredMapping(slug), [atleta.nomeNormalizado]: { playAtletaId: a.id, nome: a.nome, email: a.email } };
                    writeStoredMapping(slug, merged);
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
      )}
    </div>
  );
}

export default function AdminImportarSuperCampeonatoPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [carregandoCats, setCarregandoCats] = useState(true);
  const [erroCats, setErroCats] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [carregandoPreview, setCarregandoPreview] = useState(false);
  const [erroPreview, setErroPreview] = useState<string | null>(null);

  const [modoCategoria, setModoCategoria] = useState<"EXISTENTE" | "NOVA">("EXISTENTE");
  const [categoriaId, setCategoriaId] = useState("");
  const [categoriaNome, setCategoriaNome] = useState("");
  const [categoriaGenero, setCategoriaGenero] = useState<"MASCULINO" | "FEMININO" | "MISTO">("MISTO");

  const [mapeamento, setMapeamento] = useState<Record<string, { playAtletaId: string; nome?: string; email?: string }>>({});
  const [importando, setImportando] = useState(false);
  const [erroImport, setErroImport] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ImportResult | null>(null);

  useEffect(() => {
    let ativo = true;
    async function load() {
      try {
        setCarregandoCats(true);
        setErroCats(null);
        const res = await fetch(`/api/v1/torneios/${slug}/categorias`, { cache: "no-store" });
        if (!res.ok) {
          const msg = await res.json().catch(() => null);
          throw new Error(msg?.error || "Falha ao carregar categorias");
        }
        const data = (await res.json()) as Categoria[];
        if (!ativo) return;
        setCategorias(data);
        setCategoriaId((prev) => prev || data[0]?.id || "");
      } catch (e: any) {
        if (ativo) setErroCats(e?.message || "Erro ao carregar categorias");
      } finally {
        if (ativo) setCarregandoCats(false);
      }
    }
    void load();
    return () => {
      ativo = false;
    };
  }, [slug]);

  useEffect(() => {
    if (!preview) return;
    const stored = readStoredMapping(slug);
    const initial: Record<string, { playAtletaId: string; nome?: string; email?: string }> = {};
    for (const a of preview.atletas) {
      const v = stored[a.nomeNormalizado];
      if (v?.playAtletaId) initial[a.nomeNormalizado] = v;
    }
    setMapeamento(initial);
  }, [preview, slug]);

  const totalAtletasMapeados = useMemo(() => Object.values(mapeamento).filter((m) => Boolean(m?.playAtletaId)).length, [mapeamento]);
  const totalAtletasPreview = preview?.atletas?.length ?? 0;

  const podePreview = Boolean(file) && !carregandoPreview;
  const podeImportar =
    Boolean(file) &&
    Boolean(preview) &&
    !importando &&
    totalAtletasPreview > 0 &&
    totalAtletasMapeados === totalAtletasPreview &&
    (modoCategoria === "EXISTENTE" ? Boolean(categoriaId) : Boolean(categoriaNome.trim() && categoriaGenero));

  async function gerarPreview() {
    if (!file) return;
    setErroPreview(null);
    setResultado(null);
    setErroImport(null);
    try {
      setCarregandoPreview(true);
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch(`/api/v1/torneios/${slug}/importacoes/supercampeonato/preview`, { method: "POST", body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Falha ao gerar prévia");
      setPreview(data.preview as Preview);
    } catch (e: any) {
      setErroPreview(e?.message || "Erro ao gerar prévia");
      setPreview(null);
    } finally {
      setCarregandoPreview(false);
    }
  }

  async function importar() {
    if (!file || !preview) return;
    setErroImport(null);
    setResultado(null);
    try {
      setImportando(true);
      const payload = {
        categoriaId: modoCategoria === "EXISTENTE" ? categoriaId : undefined,
        categoriaNome: modoCategoria === "NOVA" ? categoriaNome.trim() : undefined,
        categoriaGenero: modoCategoria === "NOVA" ? categoriaGenero : undefined,
        mapeamento: Object.fromEntries(Object.entries(mapeamento).map(([k, v]) => [k, { playAtletaId: v.playAtletaId }])),
      };
      const fd = new FormData();
      fd.set("file", file);
      fd.set("payload", JSON.stringify(payload));
      const res = await fetch(`/api/v1/torneios/${slug}/importacoes/supercampeonato/importar`, { method: "POST", body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Falha ao importar");
      setResultado(data as ImportResult);
    } catch (e: any) {
      setErroImport(e?.message || "Erro ao importar");
    } finally {
      setImportando(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/torneios/${slug}`}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
          >
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Link>
          <div>
            <div className="text-lg font-semibold text-slate-900">Importar Super Campeonato</div>
            <div className="text-sm text-slate-600">1 arquivo por categoria (aba “Resultados”). Você pode repetir para outras categorias.</div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="text-sm font-medium text-slate-700">Arquivo (.xlsx)</div>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                setPreview(null);
                setResultado(null);
                setErroPreview(null);
                setErroImport(null);
              }}
              className="block w-full text-sm"
            />
            <div className="text-xs text-slate-500">Precisa conter a aba “Resultados”.</div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-slate-700">Categoria destino</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setModoCategoria("EXISTENTE")}
                className={`rounded-md border px-3 py-2 text-sm ${modoCategoria === "EXISTENTE" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:bg-slate-50"}`}
              >
                Existente
              </button>
              <button
                type="button"
                onClick={() => setModoCategoria("NOVA")}
                className={`rounded-md border px-3 py-2 text-sm ${modoCategoria === "NOVA" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:bg-slate-50"}`}
              >
                Criar nova
              </button>
            </div>

            {modoCategoria === "EXISTENTE" ? (
              <div className="space-y-2">
                <select
                  value={categoriaId}
                  onChange={(e) => setCategoriaId(e.target.value)}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 bg-white"
                  disabled={carregandoCats || categorias.length === 0}
                >
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} • {c.genero}
                    </option>
                  ))}
                </select>
                {carregandoCats && <div className="text-xs text-slate-500">Carregando categorias…</div>}
                {erroCats && <div className="text-xs text-red-600">{erroCats}</div>}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <div className="text-xs font-medium text-slate-700">Nome</div>
                  <input
                    value={categoriaNome}
                    onChange={(e) => setCategoriaNome(e.target.value)}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                    placeholder="Ex: Feminina C"
                  />
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-medium text-slate-700">Gênero</div>
                  <select
                    value={categoriaGenero}
                    onChange={(e) => setCategoriaGenero(e.target.value as any)}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 bg-white"
                  >
                    <option value="MASCULINO">MASCULINO</option>
                    <option value="FEMININO">FEMININO</option>
                    <option value="MISTO">MISTO</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={gerarPreview}
            disabled={!podePreview}
            className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {carregandoPreview ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
            Gerar prévia
          </button>
          {erroPreview && <div className="text-sm text-red-600">{erroPreview}</div>}
        </div>
      </div>

      {preview && (
        <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">Prévia</div>
              <div className="text-xs text-slate-600">Aba: {preview.sheetName}</div>
            </div>
            <div className="text-sm text-slate-700">
              {preview.totalJogos} jogos • {preview.rodadas.length} rodadas • {preview.atletas.length} atletas • {preview.arenas.length} arenas
            </div>
          </div>

          {preview.warnings.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="font-medium">Avisos da leitura do Excel</div>
              <div className="mt-1 text-xs whitespace-pre-wrap">{preview.warnings.slice(0, 12).join("\n")}</div>
            </div>
          )}

          <div className="space-y-3">
            <div className="text-sm font-semibold text-slate-900">Mapeamento de atletas ({totalAtletasMapeados}/{totalAtletasPreview})</div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {preview.atletas.map((a) => (
                <AtletaMapRow
                  key={a.nomeNormalizado}
                  slug={slug}
                  atleta={a}
                  value={mapeamento[a.nomeNormalizado] ?? null}
                  onChange={(next) => {
                    setMapeamento((prev) => {
                      const copy = { ...prev };
                      if (!next) delete copy[a.nomeNormalizado];
                      else copy[a.nomeNormalizado] = next;
                      return copy;
                    });
                  }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={importar}
              disabled={!podeImportar}
              className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {importando ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Importar
            </button>
            {erroImport && <div className="text-sm text-red-600">{erroImport}</div>}
          </div>
        </div>
      )}

      {resultado && (
        <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
          <div className="text-sm font-semibold text-slate-900">Importação concluída</div>
          <div className="text-sm text-slate-700">
            Categoria: <span className="font-medium">{resultado.categoria.nome}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {Object.entries(resultado.counters).map(([k, v]) => (
              <div key={k} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-xs text-slate-600">{k}</div>
                <div className="font-semibold text-slate-900">{String(v)}</div>
              </div>
            ))}
          </div>
          {resultado.warnings?.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="font-medium">Avisos</div>
              <div className="mt-1 text-xs whitespace-pre-wrap">{resultado.warnings.slice(0, 20).join("\n")}</div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/torneios/${slug}/categorias/${resultado.categoria.id}/jogos/super`}
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
            >
              Ver jogos da categoria
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

