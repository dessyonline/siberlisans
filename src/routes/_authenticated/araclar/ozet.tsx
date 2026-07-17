import { createFileRoute } from "@tanstack/react-router";
import { ToolShell } from "@/components/ToolShell";

export const Route = createFileRoute("/_authenticated/araclar/ozet")({
  component: () => (
    <ToolShell
      toolKey="summary"
      title="Metin Özetleyici"
      hint="Uzun metni maksimum 6 maddede özetler."
      inputLabel="uzun metin"
      placeholder="Buraya makale, döküman veya notlarını yapıştır..."
    />
  ),
});
