import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Link2, Copy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/araclar/url")({
  component: Page,
  head: () => ({
    meta: [
      { title: "URL Kodla / Çöz & Analiz — SiberPHP" },
      { name: "description", content: "URL encode/decode yap, query parametrelerini tablo halinde incele. Tamamen tarayıcıda çalışır." },
    ],
  }),
});

function Page() {
  const [text, setText] = useState("");
  const [out, setOut] = useState("");

  const parts = useMemo(() => {
    try {
      const u = new URL(text.trim());
      return {
        protocol: u.protocol.replace(":", ""),
        host: u.host,
        path: u.pathname,
        hash: u.hash,
        params: [...u.searchParams.entries()],
      };
    } catch {
      return null;
    }
  }, [text]);

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-lg p-4 sm:p-6">
        <div className="font-mono text-xs text-muted-foreground">$ ./url --encode --inspect<span className="terminal-caret" /></div>
        <h1 className="mt-2 font-mono text-2xl neon-text flex items-center gap-2">
          <Link2 className="h-5 w-5" /> URL Kodla / Çöz
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">Encode/decode + query parametre analizi.</p>
      </div>

      <div className="glass-card rounded-lg p-4 space-y-3">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="https://site.com/yol?a=1&b=iki" className="font-mono text-sm break-all" />
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setOut(encodeURIComponent(text))} className="font-mono neon-glow">{"> "}encode</Button>
          <Button variant="outline" className="font-mono" onClick={() => { try { setOut(decodeURIComponent(text)); } catch { toast.error("Geçersiz kodlama"); } }}>decode</Button>
          <Button variant="outline" className="font-mono" onClick={() => setOut(encodeURI(text))}>encodeURI (tam adres)</Button>
        </div>
      </div>

      {out && (
        <div className="glass-card rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-xs text-muted-foreground">$ output · {out.length} karakter</span>
            <button onClick={() => { navigator.clipboard.writeText(out); toast.success("Kopyalandı"); }} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
              <Copy className="h-3 w-3" /> kopyala
            </button>
          </div>
          <pre className="font-mono text-xs whitespace-pre-wrap break-all bg-background/40 rounded p-3">{out}</pre>
        </div>
      )}

      {parts && (
        <div className="glass-card rounded-lg p-4 space-y-2">
          <div className="font-mono text-xs text-muted-foreground">$ url --parse</div>
          <Row k="protokol" v={parts.protocol} />
          <Row k="host" v={parts.host} />
          <Row k="yol" v={parts.path} />
          {parts.hash && <Row k="hash" v={parts.hash} />}
          {parts.params.length > 0 && (
            <div className="pt-2 border-t border-primary/10 space-y-1">
              <div className="font-mono text-[10px] text-muted-foreground">query ({parts.params.length})</div>
              {parts.params.map(([k, v], i) => (
                <div key={`${k}-${i}`} className="flex gap-2 font-mono text-xs">
                  <span className="text-primary shrink-0">{k}</span>
                  <span className="text-muted-foreground">=</span>
                  <span className="break-all">{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 font-mono text-xs">
      <span className="text-muted-foreground">{k}</span>
      <span className="break-all text-right">{v}</span>
    </div>
  );
}
