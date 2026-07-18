import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Binary, Copy, Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/araclar/base64")({
  component: Page,
  head: () => ({ meta: [{ title: "Base64 Encoder/Decoder — SiberPHP" }] }),
});

function utf8ToB64(s: string) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s)));
}
function b64ToUtf8(s: string) {
  const bin = atob(s.replace(/\s+/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function Page() {
  const [text, setText] = useState("");
  const [out, setOut] = useState("");
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const encode = () => {
    setErr("");
    try { setOut(utf8ToB64(text)); } catch (e) { setErr((e as Error).message); }
  };
  const decode = () => {
    setErr("");
    try { setOut(b64ToUtf8(text)); } catch (e) { setErr("Geçersiz Base64"); }
  };
  const encodeFile = async (f: File) => {
    if (f.size > 5 * 1024 * 1024) return toast.error("Max 5 MB");
    const buf = await f.arrayBuffer();
    let bin = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
    const b64 = btoa(bin);
    setOut(`data:${f.type || "application/octet-stream"};base64,${b64}`);
    toast.success(`${f.name} → data URI`);
  };

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-lg p-4 sm:p-6">
        <div className="font-mono text-xs text-muted-foreground">$ ./base64 --local<span className="terminal-caret" /></div>
        <h1 className="mt-2 font-mono text-2xl neon-text flex items-center gap-2">
          <Binary className="h-5 w-5" /> Base64 Encoder / Decoder
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">Metin veya dosya → Base64. Tarayıcıda çalışır.</p>
      </div>

      <div className="glass-card rounded-lg p-4 space-y-3">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder="metin veya base64 yapıştır"
          className="font-mono text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={encode} className="font-mono neon-glow">{"> "}encode</Button>
          <Button onClick={decode} variant="outline" className="font-mono">decode</Button>
          <input ref={fileRef} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && encodeFile(e.target.files[0])} />
          <Button onClick={() => fileRef.current?.click()} variant="outline" className="font-mono">
            <Upload className="h-4 w-4 mr-1" /> dosya → base64
          </Button>
        </div>
        {err && <div className="font-mono text-xs text-red-400">✗ {err}</div>}
      </div>

      {out && (
        <div className="glass-card rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-xs text-muted-foreground">$ output · {out.length} karakter</span>
            <button
              onClick={() => { navigator.clipboard.writeText(out); toast.success("Kopyalandı"); }}
              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
            >
              <Copy className="h-3 w-3" /> kopyala
            </button>
          </div>
          <pre className="font-mono text-xs whitespace-pre-wrap break-all bg-background/40 rounded p-3 max-h-[500px] overflow-auto">{out}</pre>
        </div>
      )}
    </div>
  );
}
