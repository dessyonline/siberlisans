import { createFileRoute } from "@tanstack/react-router";
import { ToolShell } from "@/components/ToolShell";

export const Route = createFileRoute("/_authenticated/araclar/slogan")({
  component: () => (
    <ToolShell
      toolKey="slogan"
      title="Slogan Üretici"
      hint="Ürününe / hizmetine 5 akılda kalıcı slogan üretir."
      inputLabel="ürün / hizmet açıklaması"
      placeholder="Örn: Yapay zeka destekli yazılım lisans satış platformu — anında teslim."
    />
  ),
});
