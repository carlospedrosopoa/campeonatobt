import { NextRequest, NextResponse } from "next/server";
import { extractFileNameFromUrl, getSignedUrl } from "@/lib/googleCloudStorage";

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get("url");
    if (!url) return NextResponse.json({ error: "URL não informada" }, { status: 400 });

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return NextResponse.json({ error: "URL inválida" }, { status: 400 });
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return NextResponse.json({ error: "Protocolo não suportado" }, { status: 400 });
    }

    let upstream = await fetch(parsed.toString(), { cache: "no-store", redirect: "follow" });
    if (!upstream.ok && upstream.status === 403) {
      const isGoogleStorage = parsed.hostname.includes("storage.googleapis.com") || parsed.hostname.includes("storage.cloud.google.com");
      if (isGoogleStorage) {
        const fileName = extractFileNameFromUrl(parsed.toString());
        if (fileName) {
          const signedUrl = await getSignedUrl(fileName, 3600);
          if (signedUrl) {
            upstream = await fetch(signedUrl, { cache: "no-store", redirect: "follow" });
          }
        }
      }
    }
    if (!upstream.ok) return NextResponse.json({ error: "Falha ao carregar imagem" }, { status: upstream.status });

    const contentType = upstream.headers.get("content-type") || "image/png";
    const arrayBuffer = await upstream.arrayBuffer();
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Erro no proxy de imagem:", error);
    return NextResponse.json({ error: "Erro ao carregar imagem" }, { status: 500 });
  }
}
