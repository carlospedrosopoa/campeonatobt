"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { ArrowLeft, Printer } from "lucide-react";
import { Alert, Button } from "@/components/admin/ui";

type QrPayload = { data: string; url: string; torneio: { nome: string; slug: string }; checkinModo: string };

function dataExtenso(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12)).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

// QR do dia para imprimir e deixar na mesa da organizacao (muda todo dia)
export default function QrCheckinPage() {
  const { slug } = useParams<{ slug: string }>();
  const [qr, setQr] = useState<QrPayload | null>(null);
  const [imagem, setImagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/v1/torneios/${slug}/presencas/qr`, { cache: "no-store" });
        const payload = (await res.json().catch(() => null)) as any;
        if (!res.ok) throw new Error(payload?.error || "Falha ao gerar o QR do dia");
        setQr(payload as QrPayload);
        const svg = await QRCode.toString(payload.url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
        setImagem(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      } catch (e: any) {
        setErro(e?.message || "Erro inesperado");
      }
    })();
  }, [slug]);

  return (
    <div className="min-h-screen bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-paper px-4 py-3 print:hidden">
        <Link href={`/admin/torneios/${slug}/lista-chamada`} className="inline-flex items-center gap-2 text-sm font-semibold text-ink-2 hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Lista de chamada
        </Link>
        <Button variant="primary" onClick={() => window.print()} icon={<Printer />} disabled={!imagem}>
          Imprimir
        </Button>
      </div>

      {erro && <Alert className="m-4">{erro}</Alert>}
      {qr?.checkinModo === "BOTAO" && (
        <Alert tone="warning" className="m-4 print:hidden">
          Este torneio está configurado para check-in só pelo botão do app: o QR não será aceito. Mude em Dados do torneio se quiser usar o QR.
        </Alert>
      )}

      {qr && (
        <main className="mx-auto flex max-w-[720px] flex-col items-center px-6 py-10 text-center print:py-6">
          <div className="text-sm font-extrabold uppercase tracking-[0.12em] text-muted">{qr.torneio.nome}</div>
          <h1 className="mt-3 font-display text-[56px] font-bold leading-none text-ink">Faça seu check-in</h1>
          <p className="mt-3 text-lg text-ink-2">Aponte a câmera do celular para o código e confirme sua presença.</p>
          {imagem ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imagem} alt="QR de check-in" className="mt-8 aspect-square w-full max-w-[460px]" />
          ) : (
            <div className="mt-8 aspect-square w-full max-w-[460px] animate-pulse rounded-2xl bg-sand-2" />
          )}
          <div className="mt-6 rounded-full bg-ink px-5 py-2 text-base font-bold capitalize text-white">Válido só em {dataExtenso(qr.data)}</div>
          <ol className="mt-8 space-y-1.5 text-left text-base text-ink-2">
            <li>1. Leia o código e entre com sua conta do Play na Quadra.</li>
            <li>2. Confirme que você chegou.</li>
            <li>3. Se seu parceiro também já está aqui, confirme ele junto.</li>
          </ol>
          <p className="mt-8 break-all text-xs text-muted print:hidden">{qr.url}</p>
        </main>
      )}
    </div>
  );
}
