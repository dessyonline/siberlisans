import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ShieldAlert, Copy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/araclar/jwt")({
  component: Page,
  head: () => ({
    meta: [
      { title: "JWT Çözümleyici — SiberPHP" },
      { name: "description", content: "JWT token'ın header ve payload bölümlerini tarayıcında çöz, süre bilgisini gör. Token sunucuya gönderilmez." },
    ],
  }),
});

function b64urlDecode(s: string) {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function Page() {
  const [token, setToken] = useState("");

  const parsed = useMemo(() => {
    const t = token.trim().replace(/^Bearer\s+/i, "");
    if (!t) return null;
    const parts = t.split(".");
    if (parts.length < 2) return { error: "Geçersiz format — 3 parça bekleniyor (header.payload.signature)" };
    try {
      const header = JSON.parse(b64urlDecode(parts[0]));
      const payload = JSON.parse(b64urlDecode(parts[1]));
      return { header, payload, signature: parts[2] ?? "" };
    } catch {
      return { error: "Çözümlenemedi — bozuk base64url veya JSON" };
    }
  }, [token]);

  const exp = parsed && "payload" in parsed ? (parsed.payload as Record<string, unknown>).exp : undefined;
  const iat = parsed && "payload" in parsed ? (parsed.payload as Record<string, unknown>).iat : undefined;
  const expDate = typeof exp === "number" ? new Date(exp * 1000) : null;
  const expired = expDate ? expDate.getTime() < Date.now() : null;

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-lg p-4 sm:p-6">
        <div className="font-mono text-xs text-muted-foreground">$ ./jwt --decode --offline<span className="terminal-caret" /></div>
        <h1 className="mt-2 font-mono text-2xl neon-text flex items-center gap-2">
          <ShieldAlert className="h-5 w-5" /> JWT Çözümleyici
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">Token tarayıcında çözülür, hiçbir yere gönderilmez. İmza doğrulaması yapılmaz.</p>
      </div>

      <div className="glass-card rounded-lg p-4">
        <Textarea value={token} onChange={(e) => setToken(e.target.value)} rows={5} placeholder="eyJhbGciOi..." className="font-mono text-xs break-all" />
      </div>

      {parsed && "error" in parsed && (
        <div className="glass-card rounded-lg p-4 font-mono text-xs text-red-400">✗ {parsed.error}</div>
      )}

      {parsed && "payload" in parsed && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Info label="algoritma" value={String((parsed.header as Record<string, unknown>).alg ?? "-")} />
            <Info label="oluşturulma" value={typeof iat === "number" ? new Date(iat * 1000).toLocaleString("tr-TR") : "-"} />
            <Info
              label="son geçerlilik"
              value={expDate ? expDate.toLocaleString("tr-TR") : "-"}
              tone={expired === null ? undefined : expired ? "bad" : "good"}
              note={expired === null ? undefined : expired ? "süresi dolmuş" : "geçerli"}
            />
          </div>
          <Block title="header" data={parsed.header} />
          <Block title="payload" data={parsed.payload} />
          {parsed.signature && (
            <div className="glass-card rounded-lg p-4">
              <div className="font-mono text-xs text-muted-foreground mb-2">$ signature</div>
              <pre className="font-mono text-[11px] break-all whitespace-pre-wrap text-muted-foreground">{parsed.signature}</pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Info({ label, value, tone, note }: { label: string; value: string; tone?: "good" | "bad"; note?: string }) {
  return (
    <div className="glass-card rounded-lg p-3">
      <div className="font-mono text-[10px] text-muted-foreground">{label}</div>
      <div className={`mt-1 font-mono text-sm ${tone === "bad" ? "text-red-400" : tone === "good" ? "text-primary" : "text-foreground"}`}>{value}</div>
      {note && <div className={`font-mono text-[10px] ${tone === "bad" ? "text-red-400/70" : "text-primary/70"}`}>{note}</div>}
    </div>
  );
}

function Block({ title, data }: { title: string; data: unknown }) {
  const json = JSON.stringify(data, null, 2);
  return (
    <div className="glass-card rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-xs text-muted-foreground">$ {title}</span>
        <button onClick={() => { navigator.clipboard.writeText(json); toast.success("Kopyalandı"); }} className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1">
          <Copy className="h-3 w-3" /> kopyala
        </button>
      </div>
      <pre className="font-mono text-xs whitespace-pre-wrap break-all bg-background/40 rounded p-3 max-h-[400px] overflow-auto">{json}</pre>
    </div>
  );
}
