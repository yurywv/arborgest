"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { navFor } from "./nav";

export function NavLinks({ perms, onNavigate }: { perms: string[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-5">
      {navFor(perms).map((g, gi) => (
        <div key={gi}>
          {g.label && <p className="mb-1 px-3 text-[11px] font-semibold tracking-wider text-brand-200/70 uppercase">{g.label}</p>}
          <ul className="space-y-0.5">
            {g.items.map((i) => {
              const active = pathname === i.href || pathname.startsWith(`${i.href}/`);
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    onClick={onNavigate}
                    className={clsx(
                      "flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition",
                      active ? "bg-white/15 text-white" : "text-brand-100 hover:bg-white/10 hover:text-white",
                    )}
                  >
                    <i.icon className="size-4.5 shrink-0" />
                    {i.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Sidebar({ perms, company }: { perms: string[]; company: string }) {
  return (
    <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-brand-900 lg:flex">
      <Link href="/dashboard" className="flex h-16 shrink-0 items-center gap-3 px-5">
        <Image src="/icons/icon-192.png" alt="" width={34} height={34} className="rounded-lg" />
        <div className="leading-tight">
          <div className="font-bold text-white">ArborGest</div>
          <div className="max-w-40 truncate text-xs text-brand-200">{company}</div>
        </div>
      </Link>
      <div className="flex-1 overflow-y-auto px-3 pb-6">
        <NavLinks perms={perms} />
      </div>
    </aside>
  );
}
