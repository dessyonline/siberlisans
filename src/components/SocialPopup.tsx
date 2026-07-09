import { useEffect, useState } from "react";
import { X, Youtube, Instagram } from "lucide-react";

const STORAGE_KEY = "sp:social-popup:v1";
const SHOW_AFTER_MS = 1800;
// 7 gün sonra tekrar göster
const REMIND_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

type Social = {
  id: string;
  label: string;
  handle: string;
  url: string;
  icon: React.ReactNode;
  glow: string;
  border: string;
  gradient: string;
};

const SOCIALS: Social[] = [
  {
    id: "yt",
    label: "YouTube",
    handle: "@siberphp",
    url: "https://youtube.com/@siberphp",
    icon: <Youtube className="h-5 w-5" />,
    glow: "shadow-[0_0_20px_rgba(239,68,68,0.35)]",
    border: "border-red-500/40 hover:border-red-500",
    gradient: "from-red-500/20 to-red-500/5",
  },
  {
    id: "ig",
    label: "Instagram",
    handle: "@siber.php",
    url: "https://instagram.com/siber.php",
    icon: <Instagram className="h-5 w-5" />,
    glow: "shadow-[0_0_20px_rgba(236,72,153,0.35)]",
    border: "border-pink-500/40 hover:border-pink-500",
    gradient: "from-pink-500/20 via-fuchsia-500/10 to-orange-500/5",
  },
  {
    id: "tt",
    label: "TikTok",
    handle: "@siberphp",
    url: "https://tiktok.com/@siberphp",
    icon: <TikTokIcon />,
    glow: "shadow-[0_0_20px_rgba(34,211,238,0.35)]",
    border: "border-cyan-500/40 hover:border-cyan-500",
    gradient: "from-cyan-500/20 to-fuchsia-500/5",
  },
];

function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.36a8.16 8.16 0 0 0 4.77 1.52V6.43a4.85 4.85 0 0 1-1.84-.35z" />
    </svg>
  );
}

export function SocialPopup() {
  const [open, setOpen] = useState(false);
  const [mounting, setMounting] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const ts = Number(raw);
        if (!Number.isNaN(ts) && Date.now() - ts < REMIND_AFTER_MS) return;
      }
    } catch {
      /* ignore */
    }
    const t = setTimeout(() => {
      setMounting(true);
      requestAnimationFrame(() => setOpen(true));
    }, SHOW_AFTER_MS);
    return () => clearTimeout(t);
  }, []);

  const close = () => {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setOpen(false);
    setTimeout(() => setMounting(false), 250);
  };

  const trackClick = (id: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
      localStorage.setItem(`${STORAGE_KEY}:clicked`, id);
    } catch {
      /* ignore */
    }
  };

  if (!mounting) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sosyal medya"
      className={`fixed inset-0 z-[100] flex items-center justify-center px-4 transition-opacity duration-200 ${
        open ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      {/* backdrop */}
      <button
        type="button"
        aria-label="Kapat"
        onClick={close}
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
      />

      {/* modal */}
      <div
        className={`relative w-full max-w-md overflow-hidden rounded-xl border border-primary/40 bg-background/95 corner-cut neon-glow transition-all duration-300 ${
          open ? "translate-y-0 scale-100 opacity-100" : "translate-y-4 scale-95 opacity-0"
        }`}
      >
        {/* cyber grid arka plan */}
        <div className="pointer-events-none absolute inset-0 cyber-grid opacity-30" aria-hidden />
        <div className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-primary/20 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-40 w-40 rounded-full bg-primary/10 blur-3xl" aria-hidden />

        {/* header */}
        <div className="relative flex items-center justify-between border-b border-primary/20 px-4 py-3">
          <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" />
            <span>$ ./follow --all</span>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Kapat"
            className="rounded-md p-1 text-muted-foreground transition hover:text-foreground hover:bg-foreground/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* body */}
        <div className="relative px-5 py-6">
          <div className="text-center">
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-primary/80">
              &lt;connect /&gt;
            </div>
            <h2 className="mt-2 font-mono text-2xl neon-text">Bize katıl</h2>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Yeni lisanslar, kampanyalar ve <span className="text-primary">siber güvenlik ipuçları</span>{" "}
              için sosyal medyada takipte kal.
            </p>
          </div>

          {/* social kartları */}
          <div className="mt-5 space-y-2.5">
            {SOCIALS.map((s) => (
              <a
                key={s.id}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackClick(s.id)}
                className={`group relative flex items-center gap-3 rounded-lg border ${s.border} bg-gradient-to-r ${s.gradient} px-4 py-3 transition-all hover:${s.glow} hover:-translate-y-0.5`}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${s.border} bg-background/60 transition-transform group-hover:scale-110`}>
                  {s.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-sm font-semibold">{s.label}</div>
                  <div className="font-mono text-[11px] text-muted-foreground truncate">{s.handle}</div>
                </div>
                <div className="font-mono text-[11px] uppercase tracking-wider text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  takip et →
                </div>
              </a>
            ))}
          </div>

          <button
            type="button"
            onClick={close}
            className="mt-5 w-full rounded-md border border-border/50 bg-background/40 py-2 font-mono text-xs text-muted-foreground transition hover:text-foreground hover:border-border"
          >
            şimdi değil, kapat
          </button>
        </div>

        <div className="scan-line" aria-hidden />
      </div>
    </div>
  );
}
