import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Type } from "lucide-react";

export const Route = createFileRoute("/_authenticated/araclar/sayac")({
  component: Page,
  head: () => ({ meta: [{ title: "Metin Sayaç — SiberPHP" }] }),
});

function Page() {
  const [text, setText] = useState("");
  const stats = useMemo(() => {
    const chars = text.length;
    const charsNoSpace = text.replace(/\s/g, "").length;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const sentences = text.trim() ? (text.match(/[.!?]+(\s|$)/g)?.length ?? 1) : 0;
    const paragraphs = text.trim() ? text.trim().split(/\n{2,}/).length : 0;
    const lines = text ? text.split(/\n/).length : 0;
    const readMin = Math.max(1, Math.ceil(words / 200));
    const speakMin = Math.max(1, Math.ceil(words / 130));
    return { chars, charsNoSpace, words, sentences, paragraphs, lines, readMin, speakMin };
  }, [text]);

  const Item = ({ label, value }: { label: string; value: number | string }) => (
    <div className="rounded border border-border/60 bg-background/40 p-3">
      <div className="font-mono text-[10px] text-muted-foreground uppercase">{label}</div>
      <div className="font-mono text-xl neon-text">{value}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-lg p-4 sm:p-6">
        <div className="font-mono text-xs text-muted-foreground">$ ./text-count --local<span className="terminal-caret" /></div>
        <h1 className="mt-2 font-mono text-2xl neon-text flex items-center gap-2">
          <Type className="h-5 w-5" /> Metin Sayaç
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">Kelime, karakter, okuma süresi — canlı.</p>
      </div>

      <div className="glass-card rounded-lg p-4">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder="yazını buraya yapıştır..."
          className="font-mono text-sm"
        />
      </div>

      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
        <Item label="karakter" value={stats.chars} />
        <Item label="karakter (boşluksuz)" value={stats.charsNoSpace} />
        <Item label="kelime" value={stats.words} />
        <Item label="cümle" value={stats.sentences} />
        <Item label="paragraf" value={stats.paragraphs} />
        <Item label="satır" value={stats.lines} />
        <Item label="okuma" value={`~${stats.readMin} dk`} />
        <Item label="konuşma" value={`~${stats.speakMin} dk`} />
      </div>
    </div>
  );
}
