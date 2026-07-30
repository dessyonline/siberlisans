import { useState } from "react";
import { createFileRoute, Outlet, redirect, Link, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { AdminCommandPalette } from "@/components/admin/CommandPalette";
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
  Star,
  Zap,
  BookOpen,
  Bitcoin,
  Boxes,
  LifeBuoy,
  Sparkles,
  Bell,
  RefreshCw,
  TrendingUp,
  History,
  Receipt,
  Shield,
  Menu,
  MessageCircleQuestion,
  Handshake,
} from "lucide-react";


export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth" });
    const { data } = await supabase.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
    if (!data) throw redirect({ to: "/hesabim" });
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalData?.currentLevel !== "aal2") {
      throw redirect({ to: "/guvenlik" });
    }
  },
  component: AdminLayout,
});

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
type NavGroup = { label: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    label: "genel",
    items: [
      { to: "/admin", label: "dashboard", icon: LayoutDashboard, exact: true },
      { to: "/admin/rapor", label: "kar/zarar raporu", icon: TrendingUp },
      { to: "/admin/denetim", label: "denetim kaydı", icon: History },
      { to: "/admin/destek", label: "destek", icon: LifeBuoy },
    ],
  },
  {
    label: "satış",
    items: [
      { to: "/admin/siparisler", label: "siparişler", icon: ShoppingCart },
      { to: "/admin/faturalar", label: "faturalar", icon: Receipt },
      { to: "/admin/abonelikler", label: "abonelikler", icon: RefreshCw },
    ],
  },
  {
    label: "katalog",
    items: [
      { to: "/admin/urunler", label: "ürünler", icon: Package },
      { to: "/admin/paketler", label: "paketler", icon: Package },
      { to: "/admin/populer", label: "popüler seçimler", icon: Star },
      { to: "/admin/keyler", label: "key havuzu", icon: KeyRound },
      { to: "/admin/lisanslar", label: "lisanslar", icon: ShieldCheck },
    ],
  },
  {
    label: "kullanıcılar",
    items: [
      { to: "/admin/kullanicilar", label: "kullanıcılar", icon: Users },
      { to: "/admin/partner", label: "partner", icon: Users },
      { to: "/admin/bildirimler", label: "bildirimler", icon: Bell },
    ],
  },
  {
    label: "pazarlama",
    items: [
      { to: "/admin/promosyonlar", label: "promosyonlar", icon: Ticket },
      { to: "/admin/kuponlar", label: "kuponlar", icon: Ticket },
      { to: "/admin/kampanyalar", label: "kampanyalar", icon: Megaphone },
      { to: "/admin/flash", label: "flash indirim", icon: Zap },
      { to: "/admin/cekilis", label: "çekiliş", icon: Ticket },
      { to: "/admin/capraz-satis", label: "çapraz satış", icon: Sparkles },
      { to: "/admin/blog", label: "blog", icon: BookOpen },
      { to: "/admin/sorular", label: "sorular", icon: MessageCircleQuestion },
      { to: "/admin/bayiler", label: "bayiler", icon: Handshake },
    ],
  },
  {
    label: "ödeme",
    items: [
      { to: "/admin/cuzdan", label: "cüzdan", icon: Wallet },
      { to: "/admin/kripto", label: "kripto", icon: Bitcoin },
      { to: "/admin/shopier", label: "shopier", icon: Wallet },
    ],
  },
  {
    label: "sistem",
    items: [
      { to: "/admin/uniquelisans", label: "uniquelisans", icon: Boxes },
      { to: "/admin/tedarikci-log", label: "tedarikçi log", icon: ShieldCheck },
      { to: "/admin/ip-yonetim", label: "ip yönetim", icon: Shield },
      { to: "/admin/ayarlar", label: "ayarlar", icon: Settings },
    ],
  },
];

const ALL_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="space-y-4">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <div className="px-3 pb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">
            {group.label}
          </div>
          <div className="space-y-0.5">
            {group.items.map((n) => {
              const active = n.exact ? pathname === n.to : pathname.startsWith(n.to);
              const Icon = n.icon;
              return (
                <Link
                  key={n.to}
                  to={n.to as "/admin"}
                  onClick={onNavigate}
                  className={`flex items-center gap-2 rounded px-3 py-2 font-mono text-sm transition-colors ${
                    active
                      ? "bg-primary/10 text-primary neon-text"
                      : "text-muted-foreground hover:text-primary hover:bg-primary/5"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{n.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function AdminLayout() {
  const loc = useLocation();
  const [open, setOpen] = useState(false);

  const activeItem =
    ALL_ITEMS.find((n) => (n.exact ? loc.pathname === n.to : loc.pathname.startsWith(n.to))) ??
    ALL_ITEMS[0];
  const ActiveIcon = activeItem.icon;

  return (
    <div className="min-h-[calc(100vh-3.5rem)] px-3 py-3 sm:px-3 sm:py-4 md:px-0 md:py-0">
      {/* MOBILE header + Sheet */}
      <div className="md:hidden sticky top-[88px] z-20 mb-4 flex items-center gap-2 rounded-lg border border-primary/20 bg-background/80 backdrop-blur px-2 py-2">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="font-mono text-xs gap-2 border-primary/30 shrink-0"
            >
              <Menu className="h-4 w-4" />
              menü
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-[300px] p-0 border-r border-primary/20 bg-background"
          >
            <SheetTitle className="sr-only">Admin menü</SheetTitle>
            <div className="flex h-full flex-col">
              <div className="border-b border-border/40 px-4 py-3">
                <div className="font-mono text-xs text-muted-foreground">
                  $ /admin<span className="terminal-caret" />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                <NavList pathname={loc.pathname} onNavigate={() => setOpen(false)} />
              </div>
              <div className="border-t border-border/40 p-3">
                <Link
                  to="/"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-1 px-3 py-2 font-mono text-xs text-muted-foreground hover:text-primary"
                >
                  <ArrowLeft className="h-3 w-3" /> siteye dön
                </Link>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <div className="flex-1 min-w-0 flex items-center gap-2 px-2">
          <ActiveIcon className="h-4 w-4 text-primary shrink-0" />
          <span className="font-mono text-sm text-foreground truncate">
            $ /admin/{activeItem.label}
          </span>
        </div>
      </div>

      {/* DESKTOP: always-visible fixed left sidebar */}
      <aside className="hidden md:fixed md:left-0 md:top-[88px] md:bottom-0 md:z-20 md:flex md:w-72 md:flex-col border-r border-t border-primary/20 bg-background/95 backdrop-blur overflow-hidden">
        <div className="border-b border-border/40 px-4 py-3 shrink-0">
          <div className="font-mono text-xs text-muted-foreground">
            $ /admin<span className="terminal-caret" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavList pathname={loc.pathname} />
        </div>
        <div className="border-t border-border/40 p-3 shrink-0">
          <Link
            to="/"
            className="flex items-center gap-1 px-3 py-2 font-mono text-xs text-muted-foreground hover:text-primary"
          >
            <ArrowLeft className="h-3 w-3" /> siteye dön
          </Link>
        </div>
      </aside>

      <div className="min-w-0 md:ml-72 md:min-h-[calc(100vh-3.5rem)] md:px-6 md:py-6">
        <Outlet />
      </div>
      <AdminCommandPalette />
    </div>
  );
}
