import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Braces, Copy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/araclar/json")({
  component: Page,
  head: () => ({ meta: [{ title: "JSON Formatter — SiberPHP" }] }),
});

function Page() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [info, setInfo] = useState<string>("");
  const [err, setErr] = useState<string>("");

  const run = (mode: "pretty" | "minify") => {
    setErr("");
    setInfo("");
    try {
      const parsed = JSON.parse(input);
      const out = mode === "pretty" ? JSON.stringify(parsed, null, 2) : JSON.stringify(parsed);
      setOutput(out);
      const keys = (function count(v: unknown): number {
        if (Array.isArray(v)) return v.reduce<number>((a, x) => a + count(x), 0);
        if (v && typeof v === "object") return Object.keys(v as object).reduce((a, k) => a + 1 + count((v as Record<string, unknown>)[k]), 0);
        return 0;
      })(parsed);
      setInfo(`✓ geçerli · ${keys} alan · ${out.length} karakter`);
    } catch (e) {
      setErr((e as Error).message);
      setOutput("");
    }
  };

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-lg p-4 sm:p-6">
        <div className="font-mono text-xs text-muted-foreground">$ ./json --local<span className="terminal-caret" /></div>
        <h1 className="mt-2 font-mono text-2xl neon-text flex items-center gap-2">
          <Braces className="h-5 w-5" /> JSON Formatter & Validator
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">Yerelde çalışır — veri sunucuya gitmez.</p>
      </div>

      <div className="glass-card rounded-lg p-4 space-y-3">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={10}
          placeholder='{"ad":"ali","yas":25}'
          className="font-mono text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => run("pretty")} className="font-mono neon-glow">{"> "}beautify</Button>
          <Button onClick={() => run("minify")} variant="outline" className="font-mono">minify</Button>
          <Button onClick={() => { setInput(""); setOutput(""); setErr(""); setInfo(""); }} variant="ghost" className="font-mono">temizle</Button>
        </div>
        {info && <div className="font-mono text-xs text-primary">{info}</div>}
        {err && <div className="font-mono text-xs text-red-400">✗ {err}</div>}
      </div>

      {output && (
        <div className="glass-card rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-xs text-muted-foreground">$ output</span>
            <button
              onClick={() => { navigator.clipboard.writeText(output); toast.success("Kopyalandı"); }}
              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
            >
              <Copy className="h-3 w-3" /> kopyala
            </button>
          </div>
          <pre className="font-mono text-xs whitespace-pre-wrap break-all bg-background/40 rounded p-3 max-h-[500px] overflow-auto">
            {output}
          </pre>
        </div>
      )}
    </div>
  );
}
