import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import {
  Terminal,
  ShieldCheck,
  LogIn,
  LayoutDashboard,
  Package,
  BookOpen,
  HelpCircle,
} from "lucide-react";




import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { MatrixRain } from "../components/MatrixRain";
import { AuthProvider, useAuth } from "../lib/auth-context";
import { Button } from "../components/ui/button";
import { Toaster } from "../components/ui/sonner";
import { supabase } from "../integrations/supabase/client";
import { initTelegramWebApp } from "../lib/telegram-webapp";
import { SupportFab } from "../components/SupportFab";
import { CartButton } from "../components/CartButton";
import { CartDrawer } from "../components/CartDrawer";
import { NotificationBell } from "../components/NotificationBell";
import { UserAvatar } from "../components/UserAvatar";
import { IpChangeGuard } from "../components/security/IpChangeGuard";
import { useQuery } from "@tanstack/react-query";

function NotFoundComponent() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="glass-card rounded-lg p-8 text-center max-w-md">
        <div className="font-mono text-sm text-muted-foreground">$ cat /var/log/access.log</div>
        <h1 className="mt-4 font-mono text-6xl neon-text">404</h1>
        <h2 className="mt-2 font-mono text-lg">SEGMENTATION_FAULT</h2>
        <p className="mt-2 text-sm text-muted-foreground">Aradığınız kaynak bu sunucuda mevcut değil.</p>
        <Link to="/" className="mt-6 inline-block font-mono text-primary underline">
          {"> "}anasayfaya dön
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="glass-card max-w-md rounded-lg p-8 text-center">
        <h1 className="font-mono text-xl neon-text">SYSTEM_HALT</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Beklenmedik bir hata oluştu. Yeniden dene veya anasayfaya dön.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            variant="default"
            className="font-mono"
          >
            {"> "}yeniden dene
          </Button>
          <Button asChild variant="outline" className="font-mono">
            <a href="/">anasayfa</a>
          </Button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "SiberPHP — Güvenli Lisans Dağıtım Sistemi" },
      {
        name: "description",
        content:
          "SiberPHP: yazılım lisans anahtarlarınızı havale/EFT ile güvenle, anında satın alın. Şifreli teslimat, kesintisiz destek.",
      },
      { name: "author", content: "SiberPHP" },
      { name: "theme-color", content: "#00ff9c" },
      { property: "og:site_name", content: "SiberPHP" },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "tr_TR" },
      { property: "og:title", content: "SiberPHP — Güvenli Lisans Dağıtım Sistemi" },
      {
        property: "og:description",
        content: "Havale/EFT ile hızlı ve güvenli lisans anahtarı teslimi.",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "SiberPHP — Güvenli Lisans Dağıtım Sistemi" },
      {
        name: "twitter:description",
        content: "Havale/EFT ile hızlı ve güvenli lisans anahtarı teslimi.",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
    ],
    scripts: [
      { src: "https://telegram.org/js/telegram-web-app.js", async: true },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "SiberPHP",
          url: "https://siberlisans.lovable.app",
          logo: "https://siberlisans.lovable.app/favicon.png",
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function AuthListener() {
  const router = useRouter();
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);
  return null;
}

function SiteHeader() {
  const { user, isAdmin, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-primary/20 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-3 sm:px-4">
        <Link to="/" className="flex items-center gap-2 font-mono shrink-0">
          <Terminal className="h-5 w-5 text-primary" />
          <span className="text-lg tracking-tight">
            <span className="neon-text">Siber</span>
            <span className="text-foreground">PHP</span>
            <span className="text-primary animate-pulse">_</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6 font-mono text-sm">
          <Link to="/" className="text-muted-foreground hover:text-primary">./anasayfa</Link>
          <Link to="/urunler" className="text-muted-foreground hover:text-primary">./ürünler</Link>
          <Link to="/blog" className="text-muted-foreground hover:text-primary">./blog</Link>
          <Link to="/nasil-calisir" className="text-muted-foreground hover:text-primary">./nasıl-çalışır</Link>
          <Link to="/sss" className="text-muted-foreground hover:text-primary">./SSS</Link>
        </nav>

        {/* Right side actions */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Mobile icon-only quick nav */}
          <nav className="flex md:hidden items-center gap-1">
            <Link
              to="/urunler"
              aria-label="Ürünler"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10"
            >
              <Package className="h-4 w-4" />
            </Link>
            <Link
              to="/nasil-calisir"
              aria-label="Nasıl çalışır"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10"
            >
              <BookOpen className="h-4 w-4" />
            </Link>
            <Link
              to="/sss"
              aria-label="SSS"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10"
            >
              <HelpCircle className="h-4 w-4" />
            </Link>
          </nav>

          <CartButton compact />
          <NotificationBell />



          {user ? (
            <>
              {isAdmin && (
                <Button asChild size="sm" variant="outline" className="font-mono px-2 sm:px-3">
                  <Link to="/admin" aria-label="Admin">
                    <LayoutDashboard className="h-4 w-4 sm:mr-1" />
                    <span className="hidden sm:inline">admin</span>
                  </Link>
                </Button>
              )}
              <Button asChild size="sm" variant="ghost" className="font-mono px-2 sm:px-3">
                <Link to="/hesabim" aria-label="Hesabım" className="flex items-center gap-1.5">
                  <HeaderUserBadge userId={user.id} />
                  <span className="hidden sm:inline">hesabım</span>
                </Link>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={signOut}
                className="hidden sm:inline-flex font-mono text-muted-foreground"
              >
                çıkış
              </Button>
            </>
          ) : (
            <Button asChild size="sm" className="font-mono px-2 sm:px-3">
              <Link to="/auth" aria-label="Giriş">
                <LogIn className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">giriş</span>
              </Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

function HeaderUserBadge({ userId }: { userId: string }) {
  const { data } = useQuery({
    queryKey: ["header-avatar-balance", userId],
    enabled: !!userId,
    queryFn: async () => {
      const [{ data: p }, { data: w }] = await Promise.all([
        supabase.from("profiles").select("avatar_id").eq("id", userId).maybeSingle(),
        supabase.from("wallets").select("balance_try").eq("user_id", userId).maybeSingle(),
      ]);
      return {
        avatar_id: (p?.avatar_id as string | null) ?? null,
        balance_try: Number(w?.balance_try ?? 0),
      };
    },
    refetchInterval: 15000,
  });
  return (
    <span className="flex items-center gap-1.5">
      <UserAvatar id={data?.avatar_id} size={22} />
      <span className="hidden md:inline font-mono text-[11px] text-primary">
        ₺{(data?.balance_try ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
      </span>
    </span>
  );
}


function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-background/60 backdrop-blur-xl mt-16">
      <div className="mx-auto max-w-7xl px-4 py-8 font-mono text-xs">
        <div className="grid gap-6 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2 text-foreground mb-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <span className="neon-text">SiberPHP</span>
            </div>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              Güvenli lisans dağıtım sistemi. Şifreli teslimat, kesintisiz destek.
            </p>
          </div>
          <div>
            <div className="text-primary/80 mb-2">./keşfet</div>
            <ul className="space-y-1 text-muted-foreground">
              <li><Link to="/urunler" className="hover:text-primary">Ürünler</Link></li>
              <li><Link to="/blog" className="hover:text-primary">Blog</Link></li>
              <li><Link to="/nasil-calisir" className="hover:text-primary">Nasıl çalışır</Link></li>
              <li><Link to="/sss" className="hover:text-primary">SSS</Link></li>
              <li><Link to="/iletisim" className="hover:text-primary">İletişim</Link></li>
            </ul>
          </div>
          <div>
            <div className="text-primary/80 mb-2">./yasal</div>
            <ul className="space-y-1 text-muted-foreground">
              <li><Link to="/kvkk" className="hover:text-primary">KVKK Aydınlatma</Link></li>
              <li><Link to="/gizlilik" className="hover:text-primary">Gizlilik Politikası</Link></li>
              <li><Link to="/iade" className="hover:text-primary">İade & Cayma</Link></li>
              <li><Link to="/kosullar" className="hover:text-primary">Kullanım Koşulları</Link></li>
            </ul>
          </div>
          <div>
            <div className="text-primary/80 mb-2">./güven</div>
            <ul className="space-y-1 text-muted-foreground">
              <li>🔒 SSL/TLS 1.3</li>
              <li>🛡️ AES-256 şifreleme</li>
              <li>✅ KVKK uyumlu</li>
              <li>🧾 Yasal fatura</li>
            </ul>
          </div>
        </div>
        <div className="mt-6 pt-4 border-t border-border/40 flex flex-col sm:flex-row items-center justify-between gap-2 text-muted-foreground text-[11px]">
          <div>© {new Date().getFullYear()} SiberPHP — Tüm hakları saklıdır.</div>
          <div className="text-primary/60">$ powered_by_secure_infra --v2</div>
        </div>
      </div>
    </footer>
  );
}



function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    // Initialize once Telegram SDK script has loaded
    if (window.Telegram?.WebApp) {
      initTelegramWebApp();
    } else {
      const t = setInterval(() => {
        if (window.Telegram?.WebApp) {
          initTelegramWebApp();
          clearInterval(t);
        }
      }, 100);
      setTimeout(() => clearInterval(t), 3000);
    }
  }, []);


  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MatrixRain />
        <AuthListener />
        <div className="flex min-h-screen flex-col">
          <SiteHeader />
          <main className="flex-1">
            <Outlet />
          </main>
          <SiteFooter />
        </div>
        <SupportFab />
        <CartDrawer />
        <IpChangeGuard />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
