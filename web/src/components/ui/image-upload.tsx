"use client";

import { useState } from "react";
import { Upload, X, Loader2, Image as ImageIcon } from "lucide-react";
import Image from "next/image";

interface ImageUploadProps {
  value?: string;
  onChange: (url: string) => void;
  label?: string;
  folder?: string;
  className?: string;
}

export function ImageUpload({ value, onChange, label, folder = "uploads", className }: ImageUploadProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value to allow uploading same file again
    e.target.value = "";

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", folder);

      const res = await fetch("/api/upload/image", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.mensagem || "Falha ao fazer upload");
      }

      const data = await res.json();
      onChange(data.url);
    } catch (err: any) {
      setError(err.message || "Erro ao enviar imagem");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {label && <label className="text-sm font-medium text-slate-700">{label}</label>}
      
      <div className="relative group">
        {value ? (
          <div className="relative w-full aspect-video rounded-md overflow-hidden border border-slate-200 bg-slate-50">
            <Image 
              src={value} 
              alt={label || "Upload"} 
              fill 
              className="object-cover"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
            <button
              onClick={(e) => {
                e.preventDefault();
                onChange("");
              }}
              className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors z-10"
              type="button"
              title="Remover imagem"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
          </div>
        ) : (
          <div 
            className={`
              relative w-full aspect-video rounded-md border-2 border-dashed 
              ${error ? "border-red-300 bg-red-50" : "border-slate-300 bg-slate-50 hover:bg-slate-100"} 
              flex flex-col items-center justify-center p-4 transition-colors cursor-pointer
            `}
          >
            {loading ? (
              <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
            ) : (
              <>
                <Upload className="w-8 h-8 text-slate-400 mb-2" />
                <p className="text-sm text-slate-500 text-center font-medium">
                  Clique para selecionar
                </p>
                <p className="text-xs text-slate-400 text-center mt-1">
                  JPG, PNG ou WEBP (Max 5MB)
                </p>
              </>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handleUpload}
              disabled={loading}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            />
          </div>
        )}
      </div>
      
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
