import { createFileRoute, Outlet, redirect, Link, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, ShoppingCart, Package, KeyRound, Settings, ArrowLeft, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth" });
    const { data } = await supabase.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
    if (!data) throw redirect({ to: "/hesabim" });
  },
  component: AdminLayout,
});

const NAV: { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean }[] = [
  { to: "/admin", label: "dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/siparisler", label: "siparişler", icon: ShoppingCart },
  { to: "/admin/urunler", label: "ürünler", icon: Package },
  { to: "/admin/keyler", label: "key havuzu", icon: KeyRound },
  { to: "/admin/kullanicilar", label: "kullanıcılar", icon: Users },
  { to: "/admin/ayarlar", label: "ayarlar", icon: Settings },
];

function AdminLayout() {
  const loc = useLocation();
  return (
    <div className="mx-auto max-w-7xl px-3 py-4 grid gap-4 md:px-4 md:py-6 md:gap-6 md:grid-cols-[220px,1fr]">
      <aside className="glass-card rounded-lg p-2 h-fit md:sticky md:top-20 md:p-3">
        <div className="hidden font-mono text-xs text-muted-foreground px-2 pt-2 pb-3 md:block">
          $ /admin<span className="terminal-caret" />
        </div>
        <nav className="flex gap-1 overflow-x-auto pb-1 md:block md:space-y-1 md:overflow-visible md:pb-0">
          {NAV.map((n) => {
            const active = n.exact ? loc.pathname === n.to : loc.pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to as "/admin"}
                className={`flex shrink-0 items-center gap-2 rounded px-3 py-2 font-mono text-xs md:text-sm ${
                  active ? "bg-primary/10 text-primary neon-text" : "text-muted-foreground hover:text-primary"
                }`}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <Link to="/" className="hidden mt-4 items-center gap-1 px-3 py-2 font-mono text-xs text-muted-foreground hover:text-primary md:flex">
          <ArrowLeft className="h-3 w-3" /> siteye dön
        </Link>
      </aside>
      <div><Outlet /></div>
    </div>
  );
}
