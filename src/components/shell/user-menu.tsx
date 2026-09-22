"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { logout } from "@/app/(auth)/actions";

export function UserMenu({ name, roleName }: { name: string; roleName: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-full py-1 pr-2 pl-1 hover:bg-stone-100">
        <span className="grid size-8 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white">{initials}</span>
        <span className="text-left leading-tight">
          <span className="block text-sm font-medium text-stone-800">{name}</span>
          <span className="block text-xs text-stone-500">{roleName}</span>
        </span>
        <ChevronDown className="size-4 text-stone-400" />
      </button>
      {open && (
        <div className="card absolute right-0 mt-2 w-48 overflow-hidden p-1">
          <Link href="/perfil" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-stone-100">
            <UserRound className="size-4" /> Meu perfil
          </Link>
          <form action={logout}>
            <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-700 hover:bg-red-50">
              <LogOut className="size-4" /> Sair
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
