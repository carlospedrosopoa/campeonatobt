"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Send, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { Alert, Button, Card, PageHeader } from "@/components/admin/ui";

type Mensagem = { role: "user" | "assistant"; content: string };
type Rascunho = Record<string, unknown>;
type Avaliacao = { faltando: string[]; avisos: string[]; pronto: boolean; valor: number | null };

const ROTULOS: Record<string, string> = {
  nome: "Nome",
  data: "Data",
  horario: "Horário",
  local: "Local",
  genero: "Gênero",
  formato: "Formato",
  tipoParticipacao: "Duplas",
  quantidadeAtletas: "Atletas",
  jogosPorAtleta: "Jogos por atleta",
  teste: "Teste",
};

/** Silencio que encerra a fala (ms) e nivel minimo considerado voz. */
const SILENCIO_MS = 1500;
const NIVEL_VOZ = 0.02;

/**
 * Pagina de teste do assistente de voz do Smart Torneio (referencia para a tela do app).
 * Toque no microfone para falar; para sozinho no silencio. A Thalita responde por voz e,
 * quando termina de falar, o microfone abre de novo (conversa de maos livres).
 */
export default function AssistenteSmartPage() {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [rascunho, setRascunho] = useState<Rascunho>({});
  const [avaliacao, setAvaliacao] = useState<Avaliacao | null>(null);
  const [pedido, setPedido] = useState<{ codigo: string; valor: number | null; pixCopiaCola: string | null } | null>(null);
  const [estado, setEstado] = useState<"parado" | "ouvindo" | "pensando" | "falando">("parado");
  const [erro, setErro] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [maosLivres, setMaosLivres] = useState(true);
  const player = useRef<HTMLAudioElement | null>(null);
  const gravador = useRef<MediaRecorder | null>(null);
  const historicoRef = useRef<Mensagem[]>([]);
  const rascunhoRef = useRef<Rascunho>({});
  const maosLivresRef = useRef(true);
  maosLivresRef.current = maosLivres;

  useEffect(() => () => gravador.current?.stream.getTracks().forEach((t) => t.stop()), []);

  function liberarAudio() {
    // o navegador so toca audio depois de um toque na pagina: o player nasce no primeiro clique
    if (!player.current) player.current = new Audio();
  }

  async function enviar(params: { audioBase64?: string; audioMime?: string; texto?: string }) {
    setEstado("pensando");
    setErro(null);
    try {
      const res = await fetch("/api/v1/atleta/smart-torneios/assistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...params, historico: historicoRef.current, rascunho: rascunhoRef.current }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Não foi possível falar com a Thalita");
      historicoRef.current = data.historico;
      rascunhoRef.current = data.rascunho;
      setMensagens(data.historico);
      setRascunho(data.rascunho);
      setAvaliacao(data.avaliacao);
      if (data.pedido) setPedido({ codigo: data.pedido.codigo, valor: data.pedido.valor, pixCopiaCola: data.pedido.pixCopiaCola });
      if (data.audioBase64 && player.current) {
        setEstado("falando");
        player.current.src = `data:${data.audioMime};base64,${data.audioBase64}`;
        player.current.onended = () => {
          setEstado("parado");
          // maos livres: depois que ela fala, o microfone abre sozinho (menos depois de criar)
          if (maosLivresRef.current && !data.pedido) void ouvir();
        };
        await player.current.play().catch(() => setEstado("parado"));
      } else {
        setEstado("parado");
      }
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado");
      setEstado("parado");
    }
  }

  async function ouvir() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      gravador.current = rec;
      const partes: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && partes.push(e.data);

      // detecta silencio para encerrar sozinho
      const ctx = new AudioContext();
      const analisador = ctx.createAnalyser();
      ctx.createMediaStreamSource(stream).connect(analisador);
      const amostras = new Float32Array(analisador.fftSize);
      let falou = false;
      let ultimoSom = Date.now();
      const inicio = Date.now();
      const vigia = setInterval(() => {
        analisador.getFloatTimeDomainData(amostras);
        const nivel = Math.sqrt(amostras.reduce((s, v) => s + v * v, 0) / amostras.length);
        if (nivel > NIVEL_VOZ) {
          falou = true;
          ultimoSom = Date.now();
        }
        const calado = Date.now() - ultimoSom > SILENCIO_MS;
        if ((falou && calado) || Date.now() - inicio > 30_000 || (!falou && Date.now() - inicio > 10_000)) {
          if (rec.state === "recording") rec.stop();
        }
      }, 100);

      rec.onstop = async () => {
        clearInterval(vigia);
        void ctx.close();
        stream.getTracks().forEach((t) => t.stop());
        if (!falou) {
          setEstado("parado");
          return;
        }
        const blob = new Blob(partes, { type: rec.mimeType || "audio/webm" });
        const base64 = await new Promise<string>((ok) => {
          const leitor = new FileReader();
          leitor.onloadend = () => ok(String(leitor.result).split(",")[1] ?? "");
          leitor.readAsDataURL(blob);
        });
        await enviar({ audioBase64: base64, audioMime: blob.type });
      };
      rec.start();
      setEstado("ouvindo");
    } catch (e: any) {
      setErro(e?.message?.includes("Permission") ? "Libere o microfone para conversar com a Thalita." : e?.message || "Microfone indisponível");
      setEstado("parado");
    }
  }

  function tocarMicrofone() {
    liberarAudio();
    if (estado === "ouvindo") {
      gravador.current?.stop();
      return;
    }
    if (estado === "falando") player.current?.pause();
    if (mensagens.length === 0) void enviar({});
    else void ouvir();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        eyebrow="Smart Torneio"
        title="Criar com a Thalita"
        description="Teste do assistente de voz (a tela final fica no app do atleta). Toque no microfone e converse; ela monta o torneio com você."
      />

      {erro && <Alert>{erro}</Alert>}

      <Card className="flex flex-col items-center gap-3 p-6">
        <button
          type="button"
          onClick={tocarMicrofone}
          disabled={estado === "pensando"}
          className={cn(
            "flex h-24 w-24 items-center justify-center rounded-full text-white shadow-lg transition-transform active:scale-95",
            estado === "ouvindo" ? "animate-pulse bg-red-600" : estado === "falando" ? "bg-ocean-strong" : "bg-ink",
            estado === "pensando" && "opacity-60"
          )}
          aria-label={estado === "ouvindo" ? "Parar de ouvir" : "Falar com a Thalita"}
        >
          {estado === "ouvindo" ? <Square className="h-9 w-9" /> : <Mic className="h-10 w-10" />}
        </button>
        <p className="text-sm font-bold text-ink">
          {estado === "ouvindo"
            ? "Ouvindo… (para sozinho quando você parar de falar)"
            : estado === "pensando"
              ? "Pensando…"
              : estado === "falando"
                ? "Thalita falando…"
                : mensagens.length === 0
                  ? "Toque para começar"
                  : "Toque para falar"}
        </p>
        <label className="flex items-center gap-2 text-xs font-semibold text-muted">
          <input type="checkbox" checked={maosLivres} onChange={(e) => setMaosLivres(e.target.checked)} />
          Mãos livres (o microfone abre sozinho depois que ela fala)
        </label>
      </Card>

      {pedido && (
        <Card className="space-y-2 border-[#17663f] p-4">
          <div className="text-base font-extrabold text-[#17663f]">Pedido criado · código {pedido.codigo}</div>
          {pedido.valor != null && <div className="text-sm text-ink">Valor: {pedido.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>}
          {pedido.pixCopiaCola && <div className="break-all rounded-[10px] bg-sand p-3 font-mono text-xs text-ink">{pedido.pixCopiaCola}</div>}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_260px]">
        <Card className="flex flex-col gap-3 p-4">
          {mensagens.length === 0 && <p className="text-sm text-muted">A conversa aparece aqui.</p>}
          {mensagens.map((m, i) => (
            <div
              key={i}
              className={cn(
                "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm",
                m.role === "assistant" ? "self-start bg-sand-2 text-ink" : "self-end bg-ink text-white"
              )}
            >
              {m.content}
            </div>
          ))}
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              liberarAudio();
              if (!texto.trim()) return;
              void enviar({ texto: texto.trim() });
              setTexto("");
            }}
          >
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ou digite aqui"
              className="h-10 min-w-0 flex-1 rounded-[10px] border border-line bg-white px-3 text-sm text-ink"
            />
            <Button type="submit" variant="dark" icon={<Send />} disabled={estado === "pensando"}>
              Enviar
            </Button>
          </form>
        </Card>

        <Card className="space-y-2 p-4">
          <h2 className="text-sm font-extrabold text-ink">Torneio sendo montado</h2>
          <dl className="space-y-1 text-[13px]">
            {Object.entries(ROTULOS).map(([k, rotulo]) =>
              rascunho[k] != null ? (
                <div key={k} className="flex justify-between gap-2">
                  <dt className="text-muted">{rotulo}</dt>
                  <dd className="truncate text-right font-semibold text-ink">{String(rascunho[k])}</dd>
                </div>
              ) : null
            )}
          </dl>
          {avaliacao?.valor != null && (
            <div className="border-t border-line pt-2 text-sm font-extrabold text-ink">
              Valor: {avaliacao.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </div>
          )}
          {avaliacao && avaliacao.faltando.length > 0 && (
            <p className="text-xs text-muted">Falta: {avaliacao.faltando.map((f) => ROTULOS[f] ?? f).join(", ")}</p>
          )}
          {avaliacao?.avisos.map((a) => (
            <p key={a} className="text-xs font-semibold text-[#8a4e00]">
              {a}
            </p>
          ))}
        </Card>
      </div>
    </div>
  );
}
