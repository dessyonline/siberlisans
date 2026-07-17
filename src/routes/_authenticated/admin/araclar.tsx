import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/araclar")({
  component: Page,
});

type Job = {
  id: string;
  user_id: string;
  kind: string;
  prompt: string;
  params: { duration?: number; aspect?: string } | null;
  cost_try: number;
  status: string;
  result_url: string | null;
  error: string | null;
  created_at: string;
};

function Page() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("ai_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    setJobs((data ?? []) as Job[]);
  };

  useEffect(() => {
    load();
  }, []);

  const complete = async (id: string) => {
    const url = urls[id]?.trim();
    if (!url) return toast.error("URL girmelisin");
    setBusy(id);
    const { error } = await supabase.rpc("admin_complete_ai_job", { _job: id, _url: url });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Tamamlandı");
    load();
  };

  const fail = async (id: string, refund: boolean) => {
    const reason = prompt("Başarısızlık nedeni?") ?? "";
    if (!reason) return;
    setBusy(id);
    const { error } = await supabase.rpc("admin_fail_ai_job", {
      _job: id,
      _reason: reason,
      _refund: refund,
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(refund ? "İade edildi" : "Başarısız işaretlendi");
    load();
  };

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-lg p-4">
        <h1 className="font-mono text-xl neon-text">$ ./admin --ai-jobs</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Toplam: {jobs.length} · Bekleyen: {jobs.filter((j) => j.status === "queued" || j.status === "processing").length}
        </p>
      </div>

      <div className="space-y-2">
        {jobs.map((j) => (
          <div key={j.id} className="glass-card rounded-lg p-3 text-xs font-mono">
            <div className="flex flex-wrap justify-between gap-2">
              <span className="text-muted-foreground">
                {new Date(j.created_at).toLocaleString("tr-TR")} · {j.params?.duration}s · {j.params?.aspect} · ₺{j.cost_try}
              </span>
              <span className="text-primary">{j.status}</span>
            </div>
            <div className="mt-1 text-foreground/80">{j.prompt}</div>
            {j.result_url && (
              <a href={j.result_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                {j.result_url}
              </a>
            )}
            {j.error && <div className="text-red-400 mt-1">{j.error}</div>}
            {(j.status === "queued" || j.status === "processing") && (
              <div className="mt-2 flex flex-wrap gap-2 items-center">
                <Input
                  placeholder="video url (mp4)"
                  value={urls[j.id] ?? ""}
                  onChange={(e) => setUrls((u) => ({ ...u, [j.id]: e.target.value }))}
                  className="max-w-md"
                />
                <Button size="sm" onClick={() => complete(j.id)} disabled={busy === j.id}>
                  tamamla
                </Button>
                <Button size="sm" variant="outline" onClick={() => fail(j.id, true)} disabled={busy === j.id}>
                  başarısız + iade
                </Button>
                <Button size="sm" variant="ghost" onClick={() => fail(j.id, false)} disabled={busy === j.id}>
                  başarısız
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
