import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Fingerprint, Copy, Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/araclar/hash")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Hash Üretici (SHA-256/384/512) — SiberPHP" },
      { name: "description", content: "Metin veya dosyadan SHA-1/256/384/512 özeti üret. Tarayıcında Web Crypto ile hesaplanır." },
    ],
  }),
});

const ALGOS = ["SHA-1", "SHA-256", "SHA-384", "SHA-512"] as const;
type Algo = (typeof ALGOS)[number];

function hex(buf: ArrayBuffer) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function Page() {
  const [text, setText] = useState("");
  const [results, setResults] = useState<{ algo: Algo; value: string }[]>([]);
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (data: BufferSource, label: string) => {
    setBusy(true);
    try {
      const out: { algo: Algo; value: string }[] = [];
      for (const a of ALGOS) out.push({ algo: a, value: hex(await crypto.subtle.digest(a, data)) });
      setResults(out);
      setSource(label);
    } catch {
      toast.error("Hash hesaplanamadı");
    } finally {
      setBusy(false);
    }
  };

  const hashText = () => {
    if (!text) return toast.error("Metin gir");
    run(new TextEncoder().encode(text), `metin · ${text.length} karakter`);
  };

  const hashFile = async (f: File) => {
    if (f.size > 200 * 1024 * 1024) return toast.error("Max 200 MB");
    run(new Uint8Array(await f.arrayBuffer()), `${f.name} · ${(f.size / 1024 / 1024).toFixed(2)} MB`);
  };

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-lg p-4 sm:p-6">
        <div className="font-mono text-xs text-muted-foreground">$ ./hash --local<span className="terminal-caret" /></div>
        <h1 className="mt-2 font-mono text-2xl neon-text flex items-center gap-2">
          <Fingerprint className="h-5 w-5" /> Hash Üretici
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">Dosya bütünlüğü doğrula veya metin özeti çıkar — SHA-1/256/384/512.</p>
      </div>

      <div className="glass-card rounded-lg p-4 space-y-3">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="hash'lenecek metni yapıştır" className="font-mono text-sm" />
        <div className="flex flex-wrap gap-2">
          <Button onClick={hashText} disabled={busy} className="font-mono neon-glow">{"> "}hash metin</Button>
          <label className="inline-flex">
            <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && hashFile(e.target.files[0])} />
            <span className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-primary/30 px-4 py-2 font-mono text-sm text-primary hover:bg-primary/10 transition">
              <Upload className="h-4 w-4" /> dosya seç
            </span>
          </label>
        </div>
        {busy && <div className="font-mono text-xs text-primary animate-pulse">hesaplanıyor...</div>}
      </div>

      {results.length > 0 && (
        <div className="glass-card rounded-lg p-4 space-y-3">
          <div className="font-mono text-xs text-muted-foreground">$ input: {source}</div>
          {results.map((r) => (
            <div key={r.algo} className="rounded border border-primary/15 bg-background/40 p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[11px] text-primary">{r.algo}</span>
                <button onClick={() => { navigator.clipboard.writeText(r.value); toast.success("Kopyalandı"); }} className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1">
                  <Copy className="h-3 w-3" /> kopyala
                </button>
              </div>
              <pre className="font-mono text-[11px] break-all whitespace-pre-wrap">{r.value}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
