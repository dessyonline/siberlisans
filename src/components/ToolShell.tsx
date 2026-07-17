import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Copy, Loader2, Sparkles } from "lucide-react";

type Props = {
  toolKey: "chat" | "translate" | "code" | "summary" | "slogan";
  title: string;
  hint: string;
  inputLabel: string;
  placeholder: string;
  extra?: React.ReactNode;
  extraPayload?: Record<string, string>;
};

export function ToolShell({ toolKey, title, hint, inputLabel, placeholder, extra, extraPayload }: Props) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [quota, setQuota] = useState<{ used: number; limit: number; points: number } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: prof } = await supabase.auth.getUser();
      if (!prof.user) return;
      const today = new Date().toISOString().slice(0, 10);
      const [{ data: p }, { data: u }] = await Promise.all([
        supabase.from("profiles").select("tier, total_points").eq("id", prof.user.id).maybeSingle(),
        supabase
          .from("ai_tool_usage")
          .select("count")
          .eq("user_id", prof.user.id)
          .eq("day", today)
          .eq("tool_key", toolKey)
          .maybeSingle(),
      ]);
      if (!alive) return;
      const tier = (p?.tier ?? "bronze").toLowerCase();
      const limit = tier === "platinum" ? 150 : tier === "gold" ? 60 : tier === "silver" ? 25 : 10;
      setQuota({ used: u?.count ?? 0, limit, points: p?.total_points ?? 0 });
    })();
    return () => {
      alive = false;
    };
  }, [toolKey]);

  const run = async () => {
    if (!input.trim()) return toast.error("Lütfen bir şeyler yaz");
    setLoading(true);
    setOutput("");
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Giriş yapmalısın");
      const res = await fetch("/api/tools/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tool: toolKey, input, ...(extraPayload ?? {}) }),
      });
      const data = await res.json();
      if (!data.ok) {
        if (data.error === "quota_exhausted") throw new Error("Günlük kotan bitti — puanın da yetmiyor.");
        if (data.error === "ai_rate_limited") throw new Error("AI çok yoğun, biraz bekle.");
        throw new Error(data.error ?? "Bir hata oluştu");
      }
      setOutput(data.response ?? "");
      if (data.quota) {
        setQuota((q) =>
          q
            ? {
                ...q,
                used: q.used + 1,
                points: data.quota.source === "points" ? data.quota.remaining_points : q.points,
              }
            : q,
        );
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-lg p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-mono text-xl neon-text flex items-center gap-2">
              <Sparkles className="h-5 w-5" /> {title}
            </h1>
            <p className="text-xs text-muted-foreground mt-1">{hint}</p>
          </div>
          {quota && (
            <div className="font-mono text-[11px] text-muted-foreground text-right">
              <div>
                bugün: <span className="text-primary">{quota.used}</span> / {quota.limit}
              </div>
              <div>
                puan: <span className="text-primary">{quota.points}</span> · aşımda 5p / kullanım
              </div>
            </div>
          )}
        </div>
      </div>

      {extra}

      <div className="glass-card rounded-lg p-4 space-y-3">
        <label className="font-mono text-xs text-muted-foreground">{inputLabel}</label>
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          rows={6}
          className="font-mono text-sm"
        />
        <Button onClick={run} disabled={loading} className="font-mono neon-glow">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "> "}
          {loading ? "çalışıyor..." : "çalıştır"}
        </Button>
      </div>

      {output && (
        <div className="glass-card rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-xs text-muted-foreground">$ output</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(output);
                toast.success("Kopyalandı");
              }}
              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
            >
              <Copy className="h-3 w-3" /> kopyala
            </button>
          </div>
          <div className="prose prose-sm prose-invert max-w-none">
            <ReactMarkdown>{output}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
