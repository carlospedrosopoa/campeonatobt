import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fixa a raiz: um package-lock.json em pasta acima faz o Turbopack inferir a raiz errada
  turbopack: {
    root: __dirname,
  },
  // card de jogo desenhado no servidor (src/lib/card-servidor.ts): canvas nativo + fontes do card
  serverExternalPackages: ["@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/api/public/torneios/*/categorias/*/partidas/*/card": [
      "./node_modules/@fontsource/barlow-semi-condensed/files/*-latin-700-*.woff2",
      "./node_modules/@fontsource/manrope/files/*-latin-800-normal.woff2",
      "./node_modules/@fontsource/inter/files/*-latin-{500,700,900}-normal.woff2",
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'storage.cloud.google.com',
      },
      {
        protocol: 'https',
        hostname: 'via.placeholder.com',
      },
    ],
  },
};

export default nextConfig;
