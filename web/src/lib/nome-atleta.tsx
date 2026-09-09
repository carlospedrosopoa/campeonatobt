import React from "react";

export function separarPrimeiroUltimoNome(nomeCompleto: string): { primeiroNome: string; ultimoNome: string } {
  const tokens = String(nomeCompleto || "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return { primeiroNome: tokens[0] || "Atleta", ultimoNome: "" };
  const ultimo = tokens[tokens.length - 1];
  const primeiros = tokens.slice(0, -1).join(" ");
  return { primeiroNome: primeiros, ultimoNome: ultimo };
}

type NomeAtletaProps = {
  nome: string;
  className?: string;
  tamanho?: "sm" | "md" | "lg";
};

export function NomeAtletaSobrenome({ nome, className, tamanho = "md" }: NomeAtletaProps) {
  const { primeiroNome, ultimoNome } = separarPrimeiroUltimoNome(nome);
  const estilos = {
    sm: { base: "text-xs font-semibold", destaque: "text-slate-900", sec: "text-slate-500 font-medium ml-1" },
    md: { base: "font-bold leading-tight", destaque: "text-slate-900", sec: "text-slate-500 font-medium ml-1" },
    lg: { base: "text-lg font-bold leading-tight", destaque: "text-slate-900", sec: "text-slate-500 font-semibold ml-1.5" },
  }[tamanho];
  return (
    <span className={`${estilos.base} ${className ?? ""}`}>
      <span className={estilos.destaque}>{primeiroNome}</span>
      {ultimoNome ? <span className={estilos.sec}>{ultimoNome}</span> : null}
    </span>
  );
}

type NomeEquipeProps = {
  atletas?: { nome: string }[] | null;
  nomeEquipeFallback?: string | null;
  tamanho?: "sm" | "md" | "lg";
  separador?: string;
  className?: string;
};

export function NomeEquipeComSobrenome({
  atletas,
  nomeEquipeFallback,
  tamanho = "md",
  separador = " / ",
  className,
}: NomeEquipeProps) {
  const lista = atletas?.filter((a) => a?.nome?.trim()) ?? [];
  if (lista.length === 0) {
    return <span className={`font-bold leading-tight text-slate-900 ${className ?? ""}`}>{nomeEquipeFallback || "A definir"}</span>;
  }
  return (
    <span className={className ?? ""}>
      {lista.map((a, idx) => (
        <React.Fragment key={idx}>
          {idx > 0 ? <span className="text-slate-400 mx-0.5 font-medium">{separador}</span> : null}
          <NomeAtletaSobrenome nome={a.nome} tamanho={tamanho} />
        </React.Fragment>
      ))}
    </span>
  );
}
