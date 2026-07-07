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
import { Terminal, ShieldCheck, LogIn, LayoutDashboard, User as UserIcon } from "lucide-react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { MatrixRain } from "../components/MatrixRain";
import { AuthProvider, useAuth } from "../lib/auth-context";
import { Button } from "../components/ui/button";
import { Toaster } from "../components/ui/sonner";
import { supabase } from "../integrations/supabase/client";
import { RecentAdditionsBubble } from "../components/RecentAdditionsBubble";

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
      { property: "og:title", content: "SiberPHP — Güvenli Lisans Dağıtım Sistemi" },
      {
        property: "og:description",
        content: "Havale/EFT ile hızlı ve güvenli lisans anahtarı teslimi.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
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
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-mono">
          <Terminal className="h-5 w-5 text-primary" />
          <span className="text-lg tracking-tight">
            <span className="neon-text">Siber</span>
            <span className="text-foreground">PHP</span>
            <span className="text-primary">_</span>
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-6 font-mono text-sm">
          <Link to="/" className="text-muted-foreground hover:text-primary">./anasayfa</Link>
          <Link to="/urunler" className="text-muted-foreground hover:text-primary">./ürünler</Link>
          <Link to="/nasil-calisir" className="text-muted-foreground hover:text-primary">./nasıl-çalışır</Link>
          <Link to="/sss" className="text-muted-foreground hover:text-primary">./SSS</Link>
        </nav>
        <div className="flex items-center gap-2">
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
      </div>
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
