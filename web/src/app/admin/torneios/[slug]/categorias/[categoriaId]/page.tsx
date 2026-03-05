import { redirect } from "next/navigation";

export default function AdminCategoriaRedirectPage({ params }: { params: { slug: string; categoriaId: string } }) {
  redirect(`/admin/torneios/${params.slug}/categorias/${params.categoriaId}/inscricoes`);
}

