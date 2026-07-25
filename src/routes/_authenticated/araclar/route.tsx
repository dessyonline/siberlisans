import { createFileRoute, Outlet, Link, useLocation } from "@tanstack/react-router";
import { Video, Film, Terminal, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/araclar")({
  ssr: false,
  component: AraclarLayout,
});

const NAV = [
  { to: "/araclar", label: "hub", icon: Terminal, exact: true },
  { to: "/araclar/video", label: "AI video · ₺", icon: Video },
  { to: "/araclar/video-uzun", label: "AI uzun video", icon: Film },
];

function AraclarLayout() {
  const loc = useLocation();
  return (
    <div className="mx-auto max-w-7xl px-3 py-4 md:px-4 md:py-6 grid gap-4 md:grid-cols-[220px,1fr]">
      <aside className="glass-card rounded-lg h-fit md:sticky md:top-20 p-3">
        <div className="font-mono text-xs text-muted-foreground px-2 pb-3">
          $ ./araclar<span className="terminal-caret" />
        </div>
        <nav className="space-y-1">
          {NAV.map((n) => {
            const active = n.exact ? loc.pathname === n.to : loc.pathname.startsWith(n.to);
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to as "/araclar"}
                className={`flex items-center gap-2 rounded px-3 py-2 font-mono text-sm ${
                  active ? "bg-primary/10 text-primary neon-text" : "text-muted-foreground hover:text-primary"
                }`}
              >
                <Icon className="h-4 w-4" />
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
