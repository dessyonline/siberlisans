import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  Search,
  ShoppingCart,
  User,
  Package,
  ArrowRight,
  Terminal,
  Loader2,
  Zap,
  KeyRound,
  Wallet,
  Ticket,
  Bell,
  Shield,
  TrendingUp,
  History,
  Settings,
  LifeBuoy,
  BookOpen,
  Star,
  Boxes,
  Bitcoin,
  Megaphone,
  RefreshCw,
  Receipt,
  Sparkles,
  Users,
  ShieldCheck,
} from "lucide-react";

type NavCmd = { kind: "nav"; label: string; to: string; icon: typeof Zap; hint?: string };
type ResultRow =
  | NavCmd
  | { kind: "order"; id: string; ref: string; status: string; price: number; email: string | null; created_at: string }
  | { kind: "user"; id: string; email: string | null; display_name: string | null; created_at: string }
  | { kind: "product"; id: string; name: string; slug: string; active: boolean };

const NAV_CMDS: NavCmd[] = [
  { kind: "nav", label: "dashboard", to: "/admin", icon: Terminal, hint: "kontrol merkezi" },
  { kind: "nav", label: "siparişler", to: "/admin/siparisler", icon: ShoppingCart },
  { kind: "nav", label: "kullanıcılar", to: "/admin/kullanicilar", icon: Users },
  { kind: "nav", label: "ürünler", to: "/admin/urunler", icon: Package },
  { kind: "nav", label: "key havuzu", to: "/admin/keyler", icon: KeyRound },
  { kind: "nav", label: "cüzdan", to: "/admin/cuzdan", icon: Wallet },
  { kind: "nav", label: "kripto", to: "/admin/kripto", icon: Bitcoin },
  { kind: "nav", label: "shopier", to: "/admin/shopier", icon: Wallet },
  { kind: "nav", label: "faturalar", to: "/admin/faturalar", icon: Receipt },
  { kind: "nav", label: "abonelikler", to: "/admin/abonelikler", icon: RefreshCw },
  { kind: "nav", label: "paketler", to: "/admin/paketler", icon: Package },
  { kind: "nav", label: "popüler seçimler", to: "/admin/populer", icon: Star },
  { kind: "nav", label: "lisanslar", to: "/admin/lisanslar", icon: ShieldCheck },
  { kind: "nav", label: "partner", to: "/admin/partner", icon: Users },
  { kind: "nav", label: "bildirimler", to: "/admin/bildirimler", icon: Bell },
  { kind: "nav", label: "promosyonlar", to: "/admin/promosyonlar", icon: Ticket },
  { kind: "nav", label: "kuponlar", to: "/admin/kuponlar", icon: Ticket },
  { kind: "nav", label: "kampanyalar", to: "/admin/kampanyalar", icon: Megaphone },
  { kind: "nav", label: "flash indirim", to: "/admin/flash", icon: Zap },
  { kind: "nav", label: "çekiliş", to: "/admin/cekilis", icon: Ticket },
  { kind: "nav", label: "çapraz satış", to: "/admin/capraz-satis", icon: Sparkles },
  { kind: "nav", label: "blog", to: "/admin/blog", icon: BookOpen },
  { kind: "nav", label: "uniquelisans", to: "/admin/uniquelisans", icon: Boxes },
  { kind: "nav", label: "tedarikçi log", to: "/admin/tedarikci-log", icon: ShieldCheck },
  { kind: "nav", label: "ip yönetim", to: "/admin/ip-yonetim", icon: Shield },
  { kind: "nav", label: "kar/zarar raporu", to: "/admin/rapor", icon: TrendingUp },
  { kind: "nav", label: "denetim kaydı", to: "/admin/denetim", icon: History },
  { kind: "nav", label: "destek", to: "/admin/destek", icon: LifeBuoy },
  { kind: "nav", label: "ayarlar", to: "/admin/ayarlar", icon: Settings },
];

export function AdminCommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Global hotkey
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Nav filter
  const navMatches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return NAV_CMDS.slice(0, 8);
    return NAV_CMDS.filter((n) => n.label.includes(s) || n.to.includes(s)).slice(0, 8);
  }, [q]);

  // Live search (debounced)
  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) {
      setRows([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const like = `%${s}%`;
        const [ordersRes, usersRes, productsRes] = await Promise.all([
          supabase
            .from("orders")
            .select("id, reference_code, status, price_try, created_at, buyer_email")
            .or(`reference_code.ilike.${like},buyer_email.ilike.${like}`)
            .order("created_at", { ascending: false })
            .limit(6),
          supabase
            .from("profiles")
            .select("id, email, display_name, created_at")
            .or(`email.ilike.${like},display_name.ilike.${like}`)
            .order("created_at", { ascending: false })
            .limit(6),
          supabase
            .from("products")
            .select("id, name, slug, active")
            .or(`name.ilike.${like},slug.ilike.${like}`)
            .limit(6),
        ]);
        const out: ResultRow[] = [];
        (ordersRes.data ?? []).forEach((o) =>
          out.push({
            kind: "order",
            id: o.id as string,
            ref: o.reference_code as string,
            status: o.status as string,
            price: Number(o.price_try),
            email: (o as { buyer_email?: string | null }).buyer_email ?? null,
            created_at: o.created_at as string,
          }),
        );
        (usersRes.data ?? []).forEach((u) =>
          out.push({
            kind: "user",
            id: u.id as string,
            email: u.email as string | null,
            display_name: u.display_name as string | null,
            created_at: u.created_at as string,
          }),
        );
        (productsRes.data ?? []).forEach((p) =>
          out.push({
            kind: "product",
            id: p.id as string,
            name: p.name as string,
            slug: p.slug as string,
            active: !!p.active,
          }),
        );
        setRows(out);
      } finally {
        setLoading(false);
        setActive(0);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const flat: ResultRow[] = useMemo(() => [...navMatches, ...rows], [navMatches, rows]);

  const go = (r: ResultRow) => {
    setOpen(false);
    if (r.kind === "nav") navigate({ to: r.to as never });
    else if (r.kind === "order") navigate({ to: "/admin/siparisler", search: { q: r.ref } as never });
    else if (r.kind === "user") navigate({ to: "/admin/kullanicilar", search: { q: r.email ?? "" } as never });
    else if (r.kind === "product") navigate({ to: "/admin/urunler", search: { edit: r.id } as never });
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const r = flat[active];
      if (r) go(r);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Komut Paleti (Ctrl/Cmd+K)"
        className="fixed bottom-4 right-4 z-40 hidden md:flex items-center gap-2 rounded-lg border border-primary/40 bg-background/80 backdrop-blur px-3 py-2 font-mono text-xs text-muted-foreground hover:text-primary hover:border-primary/70 neon-glow transition-colors"
      >
        <Search className="h-3.5 w-3.5" />
        <span>arama</span>
        <kbd className="ml-2 rounded border border-border/60 bg-black/40 px-1.5 py-0.5 text-[10px]">Ctrl K</kbd>
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm p-4 pt-[10vh]"
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKey}
        className="w-full max-w-2xl rounded-xl border border-primary/40 bg-background/95 shadow-2xl neon-glow overflow-hidden animate-scale-in"
      >
        <div className="flex items-center gap-2 border-b border-primary/20 px-4 py-3">
          <Terminal className="h-4 w-4 text-primary" />
          <span className="font-mono text-xs text-muted-foreground">$ admin/search</span>
          <span className="terminal-caret" />
          <div className="ml-auto text-[10px] font-mono text-muted-foreground">
            ↑↓ gez · ↵ aç · esc kapat
          </div>
        </div>

        <div className="flex items-center gap-2 border-b border-border/40 px-4 py-3">
          <Search className="h-4 w-4 text-primary shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="sipariş no, email, ürün, sayfa..."
            className="flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-muted-foreground"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {navMatches.length > 0 && (
            <Group label="sayfalar">
              {navMatches.map((n, i) => (
                <Row key={n.to} active={active === i} onClick={() => go(n)} onHover={() => setActive(i)}>
                  <n.icon className="h-4 w-4 text-primary/80" />
                  <span className="font-mono">{n.label}</span>
                  <span className="ml-auto text-[10px] font-mono text-muted-foreground">{n.to}</span>
                </Row>
              ))}
            </Group>
          )}

          {rows.filter((r) => r.kind === "order").length > 0 && (
            <Group label="siparişler">
              {rows
                .filter((r): r is Extract<ResultRow, { kind: "order" }> => r.kind === "order")
                .map((r) => {
                  const idx = flat.indexOf(r);
                  return (
                    <Row key={r.id} active={active === idx} onClick={() => go(r)} onHover={() => setActive(idx)}>
                      <ShoppingCart className="h-4 w-4 text-primary/80" />
                      <span className="font-mono text-primary">{r.ref}</span>
                      <span className="text-xs text-muted-foreground truncate">{r.email ?? "—"}</span>
                      <span className="ml-auto flex items-center gap-2 shrink-0">
                        <StatusChip status={r.status} />
                        <span className="font-mono text-xs">₺{r.price.toLocaleString("tr-TR")}</span>
                      </span>
                    </Row>
                  );
                })}
            </Group>
          )}

          {rows.filter((r) => r.kind === "user").length > 0 && (
            <Group label="kullanıcılar">
              {rows
                .filter((r): r is Extract<ResultRow, { kind: "user" }> => r.kind === "user")
                .map((r) => {
                  const idx = flat.indexOf(r);
                  return (
                    <Row key={r.id} active={active === idx} onClick={() => go(r)} onHover={() => setActive(idx)}>
                      <User className="h-4 w-4 text-primary/80" />
                      <span className="font-mono">{r.display_name ?? "—"}</span>
                      <span className="text-xs text-muted-foreground truncate">{r.email ?? "—"}</span>
                      <ArrowRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                    </Row>
                  );
                })}
            </Group>
          )}

          {rows.filter((r) => r.kind === "product").length > 0 && (
            <Group label="ürünler">
              {rows
                .filter((r): r is Extract<ResultRow, { kind: "product" }> => r.kind === "product")
                .map((r) => {
                  const idx = flat.indexOf(r);
                  return (
                    <Row key={r.id} active={active === idx} onClick={() => go(r)} onHover={() => setActive(idx)}>
                      <Package className="h-4 w-4 text-primary/80" />
                      <span className="truncate">{r.name}</span>
                      <span className="text-xs text-muted-foreground font-mono truncate">/{r.slug}</span>
                      <span className="ml-auto text-[10px] font-mono">
                        {r.active ? (
                          <span className="text-primary">aktif</span>
                        ) : (
                          <span className="text-muted-foreground">pasif</span>
                        )}
                      </span>
                    </Row>
                  );
                })}
            </Group>
          )}

          {q.length >= 2 && !loading && rows.length === 0 && navMatches.length === 0 && (
            <div className="py-10 text-center font-mono text-xs text-muted-foreground">
              <span className="opacity-60">// </span>eşleşme yok
            </div>
          )}

          {q.length < 2 && (
            <div className="px-3 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">
              // en az 2 karakter yaz — sipariş, email, ürün adı
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <div className="px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">
        {label}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Row({
  active,
  onClick,
  onHover,
  children,
}: {
  active: boolean;
  onClick: () => void;
  onHover: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
        active
          ? "bg-primary/15 text-primary"
          : "text-foreground/90 hover:bg-primary/5"
      }`}
    >
      {children}
    </button>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    approved: "text-primary border-primary/40 bg-primary/10",
    pending: "text-warn border-warn/40 bg-warn/10",
    reviewing: "text-warn border-warn/40 bg-warn/10",
    rejected: "text-destructive border-destructive/40 bg-destructive/10",
    failed: "text-destructive border-destructive/40 bg-destructive/10",
    cancelled: "text-muted-foreground border-border/60 bg-muted/20",
  };
  const cls = map[status] ?? "text-muted-foreground border-border/60";
  return (
    <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${cls}`}>{status}</span>
  );
}
