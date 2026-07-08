import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Terminal, ShieldCheck, LogIn, LayoutDashboard, User as UserIcon, Menu, X } from "lucide-react";


import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { MatrixRain } from "../components/MatrixRain";
import { AuthProvider, useAuth } from "../lib/auth-context";
import { Button } from "../components/ui/button";
import { Toaster } from "../components/ui/sonner";
import { supabase } from "../integrations/supabase/client";
import { initTelegramWebApp } from "../lib/telegram-webapp";

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
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const mobileLinks: Array<{ to: string; label: string; cmd: string }> = [
    { to: "/", label: "anasayfa", cmd: "cd ~" },
    { to: "/urunler", label: "ürünler", cmd: "ls ./products" },
    { to: "/nasil-calisir", label: "nasıl çalışır", cmd: "man siberphp" },
    { to: "/sss", label: "SSS", cmd: "cat FAQ.md" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-primary/20 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-mono" onClick={close}>
          <Terminal className="h-5 w-5 text-primary" />
          <span className="text-lg tracking-tight">
            <span className="neon-text">Siber</span>
            <span className="text-foreground">PHP</span>
            <span className="text-primary animate-pulse">_</span>
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-6 font-mono text-sm">
          <Link to="/" className="text-muted-foreground hover:text-primary">./anasayfa</Link>
          <Link to="/urunler" className="text-muted-foreground hover:text-primary">./ürünler</Link>
          <Link to="/nasil-calisir" className="text-muted-foreground hover:text-primary">./nasıl-çalışır</Link>
          <Link to="/sss" className="text-muted-foreground hover:text-primary">./SSS</Link>
        </nav>
        <div className="hidden md:flex items-center gap-2">
          {user ? (
            <>
              {isAdmin && (
                <Button asChild size="sm" variant="outline" className="font-mono">
                  <Link to="/admin">
                    <LayoutDashboard className="mr-1 h-4 w-4" />admin
                  </Link>
                </Button>
              )}
              <Button asChild size="sm" variant="ghost" className="font-mono">
                <Link to="/hesabim"><UserIcon className="mr-1 h-4 w-4" />hesabım</Link>
              </Button>
              <Button size="sm" variant="ghost" onClick={signOut} className="font-mono text-muted-foreground">
                çıkış
              </Button>
            </>
          ) : (
            <Button asChild size="sm" className="font-mono">
              <Link to="/auth"><LogIn className="mr-1 h-4 w-4" />giriş</Link>
            </Button>
          )}
        </div>

        {/* Mobile hamburger trigger */}
        <button
          type="button"
          aria-label={open ? "Menüyü kapat" : "Menüyü aç"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="md:hidden relative z-[60] inline-flex h-10 w-10 items-center justify-center rounded-md border border-primary/40 bg-background/80 text-primary shadow-[0_0_12px_rgba(0,255,157,0.25)] hover:bg-primary/10 active:scale-95 transition-all"
        >
          <span className="sr-only">menü</span>
          <div className="relative h-4 w-5">
            <span
              className={`absolute left-0 h-[2px] w-5 bg-primary transition-all duration-300 ${
                open ? "top-1/2 -translate-y-1/2 rotate-45" : "top-0"
              }`}
            />
            <span
              className={`absolute left-0 top-1/2 h-[2px] w-5 -translate-y-1/2 bg-primary transition-all duration-200 ${
                open ? "opacity-0" : "opacity-100"
              }`}
            />
            <span
              className={`absolute left-0 h-[2px] w-5 bg-primary transition-all duration-300 ${
                open ? "top-1/2 -translate-y-1/2 -rotate-45" : "bottom-0"
              }`}
            />
          </div>
        </button>
      </div>

      {/* Mobile full-screen menu */}
      <div
        className={`md:hidden fixed inset-0 top-14 z-50 transition-all duration-300 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-background backdrop-blur-2xl"
          onClick={close}
        />
        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(to right, hsl(var(--primary)/0.3) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--primary)/0.3) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        <div className="relative h-full overflow-y-auto px-5 pt-6 pb-10">
          {/* Terminal header */}
          <div className="mb-6 flex items-center gap-2 font-mono text-xs text-primary/70">
            <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span>root@siberphp:~$ ./menu --open</span>
          </div>

          {/* Nav list */}
          <nav className="flex flex-col gap-1">
            {mobileLinks.map((l, i) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={close}
                className="group relative block overflow-hidden rounded-lg border border-primary/15 bg-background/40 px-4 py-4 font-mono transition-all hover:border-primary/60 hover:bg-primary/5 hover:translate-x-1"
                style={{
                  animation: open ? `slideIn 0.35s ease ${i * 60}ms both` : undefined,
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-primary/60">$ {l.cmd}</div>
                    <div className="mt-1 text-lg text-foreground group-hover:text-primary transition-colors">
                      {"> "}{l.label}
                    </div>
                  </div>
                  <span className="text-primary opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
                    ↗
                  </span>
                </div>
                <span className="absolute left-0 top-0 h-full w-[2px] bg-primary scale-y-0 group-hover:scale-y-100 origin-top transition-transform" />
              </Link>
            ))}
          </nav>

          {/* Auth section */}
          <div className="mt-8 border-t border-primary/20 pt-6">
            <div className="mb-3 font-mono text-xs text-primary/60">
              # {user ? "session.active" : "session.guest"}
            </div>
            <div className="flex flex-col gap-2">
              {user ? (
                <>
                  {isAdmin && (
                    <Button asChild size="lg" variant="outline" className="font-mono justify-start border-primary/40" onClick={close}>
                      <Link to="/admin">
                        <LayoutDashboard className="mr-2 h-4 w-4" />./admin-panel
                      </Link>
                    </Button>
                  )}
                  <Button asChild size="lg" variant="secondary" className="font-mono justify-start" onClick={close}>
                    <Link to="/hesabim"><UserIcon className="mr-2 h-4 w-4" />./hesabım</Link>
                  </Button>
                  <Button
                    size="lg"
                    variant="ghost"
                    onClick={() => { close(); signOut(); }}
                    className="font-mono justify-start text-muted-foreground hover:text-destructive"
                  >
                    {"> "}exit
                  </Button>
                </>
              ) : (
                <Button asChild size="lg" className="font-mono justify-start neon-glow" onClick={close}>
                  <Link to="/auth"><LogIn className="mr-2 h-4 w-4" />./giriş-yap</Link>
                </Button>
              )}
            </div>
          </div>

          <div className="mt-10 font-mono text-[10px] text-primary/40">
            <div>[SSL/TLS 1.3] [AES-256] [KVKK]</div>
            <div className="mt-1">© {new Date().getFullYear()} SiberPHP</div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-16px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-background/60 backdrop-blur-xl mt-16">
      <div className="mx-auto max-w-7xl px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span>SiberPHP {new Date().getFullYear()} — Güvenli Lisans Dağıtım Sistemi</span>
        </div>
        <div className="flex gap-4">
          <span>SSL/TLS 1.3</span>
          <span>·</span>
          <span>AES-256</span>
          <span>·</span>
          <span>KVKK Uyumlu</span>
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
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
