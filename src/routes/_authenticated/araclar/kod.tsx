import { createFileRoute } from "@tanstack/react-router";
import { ToolShell } from "@/components/ToolShell";

export const Route = createFileRoute("/_authenticated/araclar/kod")({
  component: () => (
    <ToolShell
      toolKey="code"
      title="Kod Açıklayıcı"
      hint="Kodu satır satır açıklar ve iyileştirme önerir."
      inputLabel="kod parçası"
      placeholder="function foo() { ... }"
    />
  ),
});
