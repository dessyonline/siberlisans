import { createFileRoute, useServerFn } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Send, MessageCircle, Mail, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SITE } from "@/lib/site-config";
import { sendContactMessage } from "@/lib/contact.functions";

export const Route = createFileRoute("/iletisim")({
  head: () => ({
    meta: [
      { title: "İletişim — SiberPHP" },
      { name: "description", content: "SiberPHP destek hattı ve iletişim formu. Telegram, e-posta ile bize ulaşın." },
      { property: "og:title", content: "İletişim — SiberPHP" },
      { property: "og:description", content: "Sorularınız için 7/24 Telegram destek hattı." },
    ],
  }),
  component: IletisimPage,
});

function IletisimPage() {
  const send = useServerFn(sendContactMessage);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "", website: "" });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.message.length < 10) {
      toast.error("Mesaj en az 10 karakter olmalı.");
      return;
    }
    setLoading(true);
    try {
      await send({ data: form });
      setSent(true);
      toast.success("Mesajın iletildi. Kısa sürede dönüş yapacağız.");
      setForm({ name: "", email: "", subject: "", message: "", website: "" });
    } catch (err) {
      toast.error((err as Error).message || "Gönderilemedi. Lütfen tekrar dene.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="font-mono text-xs text-primary/70 mb-2">$ ./contact --init</div>
      <h1 className="font-mono text-3xl neon-text mb-2">İletişim</h1>
      <p className="text-muted-foreground mb-8 text-sm">
        Sipariş, teknik destek veya iş birliği için 7/24 buradayız.
      </p>

      <div className="grid gap-6 md:grid-cols-[1fr_1.3fr]">
        {/* Kanallar */}
        <div className="space-y-3">
          <a
            href={SITE.supportTelegram}
            target="_blank"
            rel="noopener noreferrer"
            className="glass-card block rounded-lg p-4 border border-primary/40 hover:border-primary hover:bg-primary/5 transition"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-md bg-primary/20 flex items-center justify-center">
                <Send className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="font-mono text-sm text-foreground">Telegram Destek</div>
                <div className="text-xs text-muted-foreground">Ortalama yanıt: &lt; 5 dk</div>
              </div>
            </div>
          </a>

          {SITE.supportWhatsapp && (
            <a
              href={SITE.supportWhatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="glass-card block rounded-lg p-4 border border-emerald-500/40 hover:border-emerald-400 hover:bg-emerald-500/5 transition"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-md bg-emerald-500/20 flex items-center justify-center">
                  <MessageCircle className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <div className="font-mono text-sm text-foreground">WhatsApp</div>
                  <div className="text-xs text-muted-foreground">Mesai saatleri</div>
                </div>
              </div>
            </a>
          )}

          <a
            href={`mailto:${SITE.email}`}
            className="glass-card block rounded-lg p-4 border border-border/60 hover:border-primary/40 transition"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-md bg-background border border-border flex items-center justify-center">
                <Mail className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <div className="font-mono text-sm text-foreground">{SITE.email}</div>
                <div className="text-xs text-muted-foreground">E-posta ile ulaşın</div>
              </div>
            </div>
          </a>

          <div className="glass-card rounded-lg p-4 border border-border/60 text-xs font-mono space-y-1 text-muted-foreground">
            <div><span className="text-primary/70">$ uptime</span> — 7/24 online</div>
            <div><span className="text-primary/70">$ region</span> — {SITE.address}</div>
            <div><span className="text-primary/70">$ trust</span> — SSL/TLS 1.3 · AES-256</div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={onSubmit} className="glass-card rounded-lg p-6 border border-primary/30 space-y-4">
          <div className="font-mono text-xs text-primary/70 mb-2">$ ./message --compose</div>
          {sent ? (
            <div className="text-center py-10">
              <div className="text-4xl mb-3">✓</div>
              <div className="font-mono text-lg neon-text mb-1">Mesajın iletildi</div>
              <div className="text-sm text-muted-foreground mb-4">
                Ekibimiz en kısa sürede dönüş yapacak.
              </div>
              <Button variant="outline" onClick={() => setSent(false)} className="font-mono">
                Yeni mesaj
              </Button>
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-mono text-muted-foreground">İsim</span>
                  <input
                    required minLength={2} maxLength={80}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="mt-1 w-full rounded-md bg-background/60 border border-border/60 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    placeholder="Adınız"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-mono text-muted-foreground">E-posta</span>
                  <input
                    required type="email" maxLength={120}
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="mt-1 w-full rounded-md bg-background/60 border border-border/60 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    placeholder="ornek@mail.com"
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-mono text-muted-foreground">Konu</span>
                <input
                  required minLength={2} maxLength={120}
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  className="mt-1 w-full rounded-md bg-background/60 border border-border/60 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  placeholder="Sipariş sorunu / Genel soru / İş birliği..."
                />
              </label>
              <label className="block">
                <span className="text-xs font-mono text-muted-foreground">Mesaj</span>
                <textarea
                  required minLength={10} maxLength={2000} rows={6}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  className="mt-1 w-full rounded-md bg-background/60 border border-border/60 px-3 py-2 text-sm focus:border-primary focus:outline-none resize-none"
                  placeholder="Detaylı olarak yaşadığın durumu anlat..."
                />
                <span className="text-[10px] text-muted-foreground">{form.message.length}/2000</span>
              </label>
              {/* Honeypot */}
              <input
                type="text" tabIndex={-1} autoComplete="off"
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
                className="hidden"
                aria-hidden="true"
              />
              <Button type="submit" disabled={loading} className="w-full font-mono">
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> gönderiliyor...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" /> $ send --secure
                  </>
                )}
              </Button>
              <p className="text-[10px] text-muted-foreground text-center">
                Gönderdiğinizde{" "}
                <a href="/kvkk" className="underline text-primary/70">KVKK Aydınlatma Metni</a>'ni okuduğunuzu kabul edersiniz.
              </p>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
