import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ToolShell } from "@/components/ToolShell";

const LANGS = ["Türkçe", "İngilizce", "Almanca", "Fransızca", "İspanyolca", "Arapça", "Rusça", "Japonca"];

export const Route = createFileRoute("/_authenticated/araclar/ceviri")({
  component: Page,
});

function Page() {
  const [source, setSource] = useState("otomatik");
  const [target, setTarget] = useState("İngilizce");
  return (
    <ToolShell
      toolKey="translate"
      title="Çevirmen"
      hint="Metni istediğin dile çevirir."
      inputLabel="çevrilecek metin"
      placeholder="Bu metni çevir..."
      extraPayload={{ sourceLang: source, targetLang: target }}
      extra={
        <div className="glass-card rounded-lg p-3 flex flex-wrap gap-3">
          <label className="flex-1 min-w-[140px]">
            <div className="text-[11px] font-mono text-muted-foreground mb-1">kaynak</div>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full rounded border border-primary/30 bg-background px-2 py-1.5 font-mono text-sm"
            >
              <option value="otomatik">otomatik algıla</option>
              {LANGS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1 min-w-[140px]">
            <div className="text-[11px] font-mono text-muted-foreground mb-1">hedef</div>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-full rounded border border-primary/30 bg-background px-2 py-1.5 font-mono text-sm"
            >
              {LANGS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
      }
    />
  );
}
