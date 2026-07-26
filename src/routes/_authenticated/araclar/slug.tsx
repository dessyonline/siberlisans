import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Type, Copy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/araclar/slug")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Türkçe Slug Üretici — SiberPHP" },
      { name: "description", content: "Türkçe karakterleri doğru dönüştüren SEO uyumlu URL slug üretici. Toplu satır desteği." },
    ],
  }),
});

const MAP: Record<string, string> = { ı: "i", İ: "i", ş: "s", Ş: "s", ğ: "g", Ğ: "g", ü: "u", Ü: "u", ö: "o", Ö: "o", ç: "c", Ç: "c" };

function slugify(s: string, sep: string, lower: boolean) {
  let out = [...s].map((c) => MAP[c] ?? c).join("");
  out = out.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (lower) out = out.toLowerCase();
  out = out.replace(/[^a-zA-Z0-9]+/g, sep).replace(new RegExp(`\\${sep}{2,}`, "g"), sep);
  return out.replace(new RegExp(`^\\${sep}+|\\${sep}+$`, "g"), "");
}

function Page() {
  const [text, setText] = useState("");
  const [sep, setSep] = useState("-");
  const [lower, setLower] = useState(true);

  const lines = useMemo(
    () => text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => ({ src: l, slug: slugify(l, sep, lower) })),
    [text, sep, lower],
  );

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-lg p-4 sm:p-6">
        <div className="font-mono text-xs text-muted-foreground">$ ./slug --tr<span className="terminal-caret" /></div>
        <h1 className="mt-2 font-mono text-2xl neon-text flex items-center gap-2">
          <Type className="h-5 w-5" /> Türkçe Slug Üretici
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">ı/ş/ğ/ü/ö/ç doğru çevrilir — SEO dostu URL. Her satır ayrı slug.</p>
      </div>

      <div className="glass-card rounded-lg p-4 space-y-3">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={"Örnek Başlık Yazısı\nİkinci Ürün Adı"} className="font-mono text-sm" />
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">ayraç</span>
          {["-", "_", "."].map((s) => (
            <button key={s} onClick={() => setSep(s)} className={`rounded border px-2.5 py-1 font-mono text-xs transition ${sep === s ? "border-primary bg-primary/10 text-primary" : "border-primary/20 text-muted-foreground hover:border-primary/50"}`}>{s}</button>
          ))}
          <button onClick={() => setLower(!lower)} className={`rounded border px-2.5 py-1 font-mono text-xs transition ${lower ? "border-primary bg-primary/10 text-primary" : "border-primary/20 text-muted-foreground"}`}>küçük harf</button>
        </div>
      </div>

      {lines.length > 0 && (
        <div className="glass-card rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-muted-foreground">$ output · {lines.length} satır</span>
            <button onClick={() => { navigator.clipboard.writeText(lines.map((l) => l.slug).join("\n")); toast.success("Kopyalandı"); }} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
              <Copy className="h-3 w-3" /> tümünü kopyala
            </button>
          </div>
          {lines.map((l, i) => (
            <button
              key={i}
              onClick={() => { navigator.clipboard.writeText(l.slug); toast.success("Kopyalandı"); }}
              className="w-full rounded border border-primary/15 bg-background/40 px-3 py-2 text-left hover:border-primary/50 transition"
            >
              <div className="font-mono text-[10px] text-muted-foreground truncate">{l.src}</div>
              <div className="font-mono text-sm text-primary break-all">{l.slug || "—"}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
