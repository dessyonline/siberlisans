import { createFileRoute, Outlet, redirect, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  KeyRound,
  Settings,
  ArrowLeft,
  Users,
  ShieldCheck,
  Ticket,
  Megaphone,
  Wallet,
  ChevronDown,
  Star,
} from "lucide-react";

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
  { to: "/admin/populer", label: "popüler seçimler", icon: Star },
  { to: "/admin/keyler", label: "key havuzu", icon: KeyRound },
  { to: "/admin/lisanslar", label: "lisanslar", icon: ShieldCheck },
  { to: "/admin/kullanicilar", label: "kullanıcılar", icon: Users },
  { to: "/admin/promosyonlar", label: "promosyonlar", icon: Ticket },
  { to: "/admin/kampanyalar", label: "kampanyalar", icon: Megaphone },
  { to: "/admin/cuzdan", label: "cüzdan", icon: Wallet },
  { to: "/admin/ayarlar", label: "ayarlar", icon: Settings },
];

function AdminLayout() {
  const loc = useLocation();
  const navigate = useNavigate();

  const activeItem =
    NAV.find((n) => (n.exact ? loc.pathname === n.to : loc.pathname.startsWith(n.to))) ?? NAV[0];
  const ActiveIcon = activeItem.icon;

  return (
    <div className="mx-auto max-w-7xl px-3 py-3 grid gap-3 sm:px-3 sm:py-4 md:px-4 md:py-6 md:gap-6 md:grid-cols-[220px,1fr]">
      {/* MOBILE: native select acting as page picker */}
      <div className="md:hidden">
        <label className="relative block">
          <span className="sr-only">Admin sayfası seç</span>
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-primary">
            <ActiveIcon className="h-4 w-4" />
          </span>
          <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground">
            <ChevronDown className="h-4 w-4" />
          </span>
          <select
            value={activeItem.to}
            onChange={(e) => navigate({ to: e.target.value as "/admin" })}
            className="w-full appearance-none rounded-lg border border-primary/30 bg-card py-3 pl-10 pr-10 font-mono text-sm text-foreground focus:outline-none focus:border-primary"
          >
            {NAV.map((n) => (
              <option key={n.to} value={n.to} className="bg-background text-foreground">
                {n.label}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-2 flex items-center justify-between px-1 font-mono text-[10px] text-muted-foreground/70">
          <span>$ /admin{activeItem.to === "/admin" ? "" : activeItem.to.replace("/admin", "")}</span>
          <Link to="/" className="hover:text-primary inline-flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> siteye dön
          </Link>
        </div>
      </div>

      {/* DESKTOP: sidebar list */}
      <aside className="hidden md:block glass-card rounded-lg h-fit md:sticky md:top-20 md:p-3 min-w-0 overflow-hidden">
        <div className="font-mono text-xs text-muted-foreground px-2 pt-2 pb-3">
          $ /admin<span className="terminal-caret" />
        </div>
        <nav className="space-y-1">
          {NAV.map((n) => {
            const active = n.exact ? loc.pathname === n.to : loc.pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to as "/admin"}
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

      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
