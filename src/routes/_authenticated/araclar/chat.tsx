import { createFileRoute } from "@tanstack/react-router";
import { ToolShell } from "@/components/ToolShell";

export const Route = createFileRoute("/_authenticated/araclar/chat")({
  component: () => (
    <ToolShell
      toolKey="chat"
      title="AI Chat"
      hint="Genel amaçlı asistan — istediğini sor."
      inputLabel="mesajın"
      placeholder="Örn: TanStack Start ve Next.js arasındaki 3 kritik fark nedir?"
    />
  ),
});
