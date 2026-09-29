import Link from "next/link";
import { CalendarPlus, ChevronRight, List, UserPlus } from "lucide-react";
import { getSession } from "@/lib/auth";
import { torneiosService } from "@/services/torneios.service";
import { Card, CardHeader, EmptyState, LinkButton, PageHeader, TorneioStatusBadge } from "@/components/admin/ui";
import { TorneioDestaque, TorneioMiniatura, periodoTorneio, type TorneioResumo } from "@/components/admin/torneio-destaque";

export const dynamic = "force-dynamic";

function paraTempo(v: string | Date | null) {
  if (!v) return Number.POSITIVE_INFINITY;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

export default async function AdminHomePage() {
  const session = await getSession();
  const user = session?.user as { id: string; nome?: string; perfil: "ADMIN" | "ORGANIZADOR" | "ATLETA" } | undefined;
  const isAdmin = user?.perfil === "ADMIN";

  let torneios: TorneioResumo[] = [];
  try {
    torneios = user ? ((await torneiosService.listarParaUsuario(user, { limit: 200 })) as TorneioResumo[]) : [];
  } catch {
    torneios = [];
  }

  const aoVivo = torneios.filter((t) => t.status === "EM_ANDAMENTO");
  const proximos = torneios
    .filter((t) => t.status === "ABERTO" || t.status === "RASCUNHO")
    .sort((a, b) => paraTempo(a.dataInicio) - paraTempo(b.dataInicio))
    .slice(0, 6);

  const primeiroNome = (user?.nome || "").split(/\s+/)[0];

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={primeiroNome ? `Olá, ${primeiroNome}` : "Admin"}
        title="Painel"
        description="Acompanhe o que está acontecendo e o que vem pela frente."
        actions={
          <LinkButton href="/admin/torneios/novo" variant="primary" icon={<CalendarPlus />}>
            Novo torneio
          </LinkButton>
        }
      />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-extrabold text-ink">Acontecendo agora</h2>
          <span className="text-[13px] text-muted">{aoVivo.length} torneio(s)</span>
        </div>
        {aoVivo.length === 0 ? (
          <Card>
            <EmptyState
              title="Nenhum torneio em andamento"
              description="Quando um torneio estiver com status Em andamento, ele aparece aqui com atalho direto."
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {aoVivo.map((t) => (
              <TorneioDestaque key={t.id} torneio={t} />
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="overflow-hidden">
          <CardHeader
            title="Próximos eventos"
            description="Inscrições abertas e rascunhos, pela data mais próxima."
            actions={
              <LinkButton href="/admin/torneios" variant="ghost" size="sm">
                Ver todos
              </LinkButton>
            }
          />
          {proximos.length === 0 ? (
            <EmptyState title="Nada agendado" description="Crie um torneio para começar a receber inscrições." />
          ) : (
            <ul>
              {proximos.map((t) => (
                <li key={t.id} className="border-b border-sand-2 last:border-b-0">
                  <Link href={`/admin/torneios/${t.slug}`} className="flex items-center gap-4 px-4 py-3 hover:bg-paper sm:px-5">
                    <TorneioMiniatura torneio={t} className="h-12 w-14" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-extrabold text-ink">{t.nome}</div>
                      <div className="truncate text-xs text-muted">
                        {periodoTorneio(t)}
                        {t.local ? ` · ${t.local}` : ""}
                      </div>
                    </div>
                    <TorneioStatusBadge status={t.status} className="hidden sm:inline-flex" />
                    <ChevronRight className="h-4 w-4 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-3">
          <Link
            href="/admin/torneios"
            className="flex items-center gap-3 rounded-[14px] border border-line bg-white p-4 hover:bg-paper"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-ocean-soft text-ocean-strong">
              <List className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold text-ink">Lista de torneios</span>
              <span className="block text-[13px] text-muted">Todos os eventos, com filtros por status.</span>
            </span>
          </Link>
          {isAdmin && (
            <Link
              href="/admin/configuracoes/organizadores"
              className="flex items-center gap-3 rounded-[14px] border border-line bg-white p-4 hover:bg-paper"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#e3f3ea] text-[#17663f]">
                <UserPlus className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-ink">Organizadores</span>
                <span className="block text-[13px] text-muted">Crie acessos para administrar torneios específicos.</span>
              </span>
            </Link>
          )}
          <div className="rounded-[14px] border border-dashed border-[#d3cfc7] p-4 text-[13px] text-ink-2">
            Dica: use <kbd className="rounded-md border border-line bg-white px-1.5 py-0.5 text-[11px] font-bold">Ctrl K</kbd> para
            encontrar qualquer torneio ou categoria.
          </div>
        </div>
      </div>
    </div>
  );
}
