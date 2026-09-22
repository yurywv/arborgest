import Link from "next/link";
import Image from "next/image";
import { Bell, Search } from "lucide-react";
import { UserMenu } from "./user-menu";

export function Topbar({ user, unread }: { user: { name: string; roleName: string }; unread: number }) {
  return (
    <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/90 backdrop-blur no-print">
      <div className="flex h-14 items-center gap-2 px-4 lg:h-16 lg:px-6">
        <Link href="/dashboard" className="shrink-0 lg:hidden" aria-label="Início">
          <Image src="/icons/icon-192.png" alt="" width={32} height={32} className="rounded-lg" />
        </Link>
        <form action="/busca" className="relative min-w-0 flex-1 lg:max-w-xl">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400" />
          <input
            name="q"
            type="search"
            placeholder="Buscar árvore, espécie, cliente, endereço…"
            className="input min-h-10 rounded-full bg-stone-100 pl-9 shadow-none focus:bg-white"
            aria-label="Busca global"
          />
        </form>
        <Link href="/notificacoes" className="relative grid size-10 shrink-0 place-items-center rounded-full hover:bg-stone-100" aria-label="Notificações">
          <Bell className="size-5 text-stone-600" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 grid min-w-4.5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Link>
        <div className="hidden lg:block">
          <UserMenu name={user.name} roleName={user.roleName} />
        </div>
      </div>
    </header>
  );
}
