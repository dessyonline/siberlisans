import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/araclar/metin-karsilastir")({
  component: Page,
  head: () => ({ meta: [{ title: "Metin Karşılaştır — SiberPHP" }] }),
});

type DiffRow = { type: "same" | "added" | "removed"; text: string; line: number };

function diffLines(left: string, right: string): DiffRow[] {
  const a = left ? left.split("\n") : [];
  const b = right ? right.split("\n") : [];
  const rows: DiffRow[] = [];
  const max = Math.max(a.length, b.length);
  for (let index = 0; index < max; index++) {
    if (a[index] === b[index]) rows.push({ type: "same", text: a[index] ?? "", line: index + 1 });
    else {
      if (a[index] !== undefined) rows.push({ type: "removed", text: a[index], line: index + 1 });
      if (b[index] !== undefined) rows.push({ type: "added", text: b[index], line: index + 1 });
    }
  }
  return rows;
}

function Page() {
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const rows = useMemo(() => diffLines(left, right), [left, right]);
  const changed = rows.filter((row) => row.type !== "same").length;

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-lg p-4 sm:p-6">
        <div className="font-mono text-xs text-muted-foreground">$ ./text-diff --local<span className="terminal-caret" /></div>
        <h1 className="mt-2 flex items-center gap-2 font-mono text-2xl neon-text"><FileText className="h-5 w-5" /> Metin Karşılaştır</h1>
        <p className="mt-1 text-xs text-muted-foreground">İki metni satır satır karşılaştır; içerik tarayıcıdan çıkmaz.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="glass-card rounded-lg p-4">
          <div className="mb-2 font-mono text-xs text-muted-foreground">sol metin</div>
          <Textarea value={left} onChange={(event) => setLeft(event.target.value)} rows={12} placeholder="eski metin..." className="font-mono text-sm" />
        </div>
        <div className="glass-card rounded-lg p-4">
          <div className="mb-2 font-mono text-xs text-muted-foreground">sağ metin</div>
          <Textarea value={right} onChange={(event) => setRight(event.target.value)} rows={12} placeholder="yeni metin..." className="font-mono text-sm" />
        </div>
      </div>
      <div className="glass-card rounded-lg p-4">
        <div className="mb-3 flex items-center justify-between font-mono text-xs">
          <span className="text-muted-foreground">$ diff</span>
          <span className={changed ? "text-yellow-400" : "text-primary"}>{changed ? `${changed} satır değişti` : "metinler aynı"}</span>
        </div>
        <div className="space-y-1 font-mono text-xs">
          {rows.length ? rows.map((row, index) => (
            <div key={`${row.line}-${index}`} className={`rounded px-2 py-1 whitespace-pre-wrap break-all ${row.type === "added" ? "bg-primary/10 text-primary" : row.type === "removed" ? "bg-destructive/10 text-destructive" : "text-muted-foreground"}`}>
              <span className="mr-3 select-none opacity-60">{row.type === "added" ? "+" : row.type === "removed" ? "-" : " "} {row.line}</span>{row.text || " "}
            </div>
          )) : <div className="rounded border border-dashed border-border/60 p-6 text-center text-muted-foreground">karşılaştırmak için iki metin gir</div>}
        </div>
      </div>
    </div>
  );
}
