"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { LayoutDashboard, Map, Menu, QrCode, Trees, X, LogOut, UserRound } from "lucide-react";
import { NavLinks } from "./sidebar";
import { logout } from "@/app/(auth)/actions";

export function MobileNav({ perms, userName }: { perms: string[]; userName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  const items = [
    { href: "/dashboard", label: "Início", icon: LayoutDashboard },
    { href: "/mapa", label: "Mapa", icon: Map },
    { href: "/escanear", label: "Escanear", icon: QrCode, primary: true },
    { href: "/arvores", label: "Árvores", icon: Trees },
  ];

  return (
    <>
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 backdrop-blur lg:hidden no-print">
        <ul className="grid h-16 grid-cols-5">
          {items.map((i) => {
            const active = pathname.startsWith(i.href);
            return (
              <li key={i.href} className="flex items-center justify-center">
                <Link
                  href={i.href}
                  className={clsx(
                    "flex flex-col items-center gap-0.5 text-[11px] font-medium",
                    i.primary ? "-mt-6" : "",
                    active ? "text-brand-700" : "text-stone-500",
                  )}
                >
                  {i.primary ? (
                    <span className="grid size-14 place-items-center rounded-full bg-brand-600 text-white shadow-lg ring-4 ring-white">
                      <i.icon className="size-6" />
                    </span>
                  ) : (
                    <i.icon className="size-6" />
                  )}
                  {i.label}
                </Link>
              </li>
            );
          })}
          <li className="flex items-center justify-center">
            <button onClick={() => setOpen(true)} className="flex flex-col items-center gap-0.5 text-[11px] font-medium text-stone-500">
              <Menu className="size-6" />
              Menu
            </button>
          </li>
        </ul>
      </nav>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="safe-bottom absolute inset-y-0 right-0 flex w-80 max-w-[85vw] flex-col bg-brand-900">
            <div className="flex h-16 items-center justify-between px-4">
              <span className="truncate font-semibold text-white">{userName}</span>
              <button onClick={() => setOpen(false)} className="grid size-11 place-items-center text-white" aria-label="Fechar menu">
                <X className="size-6" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-4">
              <NavLinks perms={perms} onNavigate={() => setOpen(false)} />
            </div>
            <div className="space-y-1 border-t border-white/10 p-3">
              <Link href="/perfil" className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm text-brand-100 hover:bg-white/10">
                <UserRound className="size-4.5" /> Meu perfil
              </Link>
              <form action={logout}>
                <button className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm text-brand-100 hover:bg-white/10">
                  <LogOut className="size-4.5" /> Sair
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
