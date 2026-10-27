import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Code2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/araclar/regex")({
  component: Page,
  head: () => ({ meta: [{ title: "Regex Test — SiberPHP" }] }),
});

function Page() {
  const [pattern, setPattern] = useState("\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b");
  const [flags, setFlags] = useState("gi");
  const [text, setText] = useState("");
  const result = useMemo(() => {
    try {
      const regex = new RegExp(pattern, flags);
      const matches = [...text.matchAll(regex)].slice(0, 100).map((match) => ({ value: match[0], index: match.index ?? 0, groups: match.slice(1) }));
      return { matches, error: "" };
    } catch (error) {
      return { matches: [], error: error instanceof Error ? error.message : "Geçersiz ifade" };
    }
  }, [pattern, flags, text]);

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-lg p-4 sm:p-6">
        <div className="font-mono text-xs text-muted-foreground">$ ./regex --local<span className="terminal-caret" /></div>
        <h1 className="mt-2 flex items-center gap-2 font-mono text-2xl neon-text"><Code2 className="h-5 w-5" /> Regex Test</h1>
        <p className="mt-1 text-xs text-muted-foreground">Düzenli ifadeni tarayıcıda dene; metin sunucuya gönderilmez.</p>
      </div>
      <div className="glass-card rounded-lg p-4 space-y-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
          <Input value={pattern} onChange={(event) => setPattern(event.target.value)} placeholder="düzenli ifade" className="font-mono" />
          <Input value={flags} onChange={(event) => setFlags(event.target.value)} placeholder="gi" className="font-mono" aria-label="Regex bayrakları" />
        </div>
        <Textarea value={text} onChange={(event) => setText(event.target.value)} rows={10} placeholder="test metnini buraya yapıştır..." className="font-mono text-sm" />
        {result.error ? <div className="font-mono text-xs text-destructive">✗ {result.error}</div> : <div className="font-mono text-xs text-primary">✓ {result.matches.length} eşleşme bulundu</div>}
      </div>
      <div className="glass-card rounded-lg p-4 space-y-2">
        <div className="font-mono text-xs text-muted-foreground">$ matches</div>
        {result.matches.length ? result.matches.map((match, index) => (
          <div key={`${match.index}-${index}`} className="rounded border border-primary/15 bg-background/30 px-3 py-2 font-mono text-xs">
            <span className="mr-3 text-muted-foreground">#{index + 1} · {match.index}. karakter</span>
            <span className="text-primary">{match.value}</span>
            {match.groups.length ? <span className="ml-3 text-muted-foreground">gruplar: {match.groups.join(" · ")}</span> : null}
          </div>
        )) : <div className="rounded border border-dashed border-border/60 p-5 text-center font-mono text-xs text-muted-foreground">henüz eşleşme yok</div>}
      </div>
    </div>
  );
}
