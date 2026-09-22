import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { MobileNav } from "@/components/shell/mobile-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [settings, unread] = await Promise.all([
    getSettings(),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  return (
    <div className="min-h-dvh">
      <Sidebar perms={user.permissions} company={settings.company_name} />
      <div className="lg:pl-64 print:pl-0">
        <Topbar user={user} unread={unread} />
        <main className="mx-auto max-w-7xl px-4 pt-4 pb-28 sm:pt-6 lg:px-6 lg:pb-10">{children}</main>
      </div>
      <MobileNav perms={user.permissions} userName={user.name} />
    </div>
  );
}
