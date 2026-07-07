import { createFileRoute, Outlet, redirect, Link, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, ShoppingCart, Package, KeyRound, Settings, ArrowLeft } from "lucide-react";

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

const NAV = [
  { to: "/admin", label: "dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/siparisler", label: "siparişler", icon: ShoppingCart },
  { to: "/admin/urunler", label: "ürünler", icon: Package },
  { to: "/admin/keyler", label: "key havuzu", icon: KeyRound },
  { to: "/admin/ayarlar", label: "ayarlar", icon: Settings },
] as const;

function AdminLayout() {
  const loc = useLocation();
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 grid gap-6 md:grid-cols-[220px,1fr]">
      <aside className="glass-card rounded-lg p-3 h-fit md:sticky md:top-20">
        <div className="font-mono text-xs text-muted-foreground px-2 pt-2 pb-3">
          $ /admin<span className="terminal-caret" />
        </div>
        <nav className="space-y-1">
          {NAV.map((n) => {
            const active = n.exact ? loc.pathname === n.to : loc.pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-2 rounded px-3 py-2 font-mono text-sm ${
                  active ? "bg-primary/10 text-primary neon-text" : "text-muted-foreground hover:text-primary"
                }`}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <Link to="/" className="mt-4 flex items-center gap-1 px-3 py-2 font-mono text-xs text-muted-foreground hover:text-primary">
          <ArrowLeft className="h-3 w-3" /> siteye dön
        </Link>
      </aside>
      <div><Outlet /></div>
    </div>
  );
}
