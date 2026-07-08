import { useEffect, useState } from "react";
import { MessageCircle, X, Send, Ticket } from "lucide-react";
import { SITE } from "@/lib/site-config";
import { useAuth } from "@/lib/auth-context";
import { Link } from "@tanstack/react-router";

/**
 * Sağ-alt köşede "destek" butonu. Açıldığında Telegram / WhatsApp / e-posta
 * seçeneklerini gösterir.
 */
export function SupportFab() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2 print:hidden">
      {open && (
        <div className="glass-card rounded-lg border border-primary/40 shadow-[0_0_25px_hsl(var(--primary)/0.25)] p-3 w-64 font-mono text-xs animate-in slide-in-from-bottom-4">
          <div className="flex items-center justify-between mb-2 text-primary/80">
            <span>$ destek --live</span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Kapat"
              className="text-muted-foreground hover:text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="text-muted-foreground mb-3">
            Sorunuz mu var? En hızlı yanıt için Telegram destek hattı:
          </div>
          <div className="flex flex-col gap-2">
            <a
              href={SITE.supportTelegram}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 hover:bg-primary/20 px-3 py-2 text-primary transition-colors"
            >
              <Send className="h-4 w-4" />
              <span>Telegram destek</span>
            </a>
            {SITE.supportWhatsapp && (
              <a
                href={SITE.supportWhatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-2 text-emerald-400 transition-colors"
              >
                <MessageCircle className="h-4 w-4" />
                <span>WhatsApp</span>
              </a>
            )}
            <a
              href={`mailto:${SITE.email}`}
              className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 hover:border-primary/40 px-3 py-2 text-muted-foreground transition-colors"
            >
              <span className="text-primary">@</span>
              <span>{SITE.email}</span>
            </a>
            <a
              href="/iletisim"
              className="text-center text-primary/70 hover:text-primary text-[10px] mt-1 underline underline-offset-2"
            >
              → detaylı iletişim formu
            </a>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Destek"
        className="relative h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-[0_0_20px_hsl(var(--primary)/0.6)] hover:scale-110 transition-transform flex items-center justify-center"
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
        {!open && (
          <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-500 border-2 border-background animate-pulse" />
        )}
      </button>
    </div>
  );
}
