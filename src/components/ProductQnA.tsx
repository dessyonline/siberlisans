import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth-context";
import { askProductQuestion, listProductQuestions } from "@/lib/product-qa.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { MessageCircleQuestion, ShieldCheck, Clock } from "lucide-react";

type QRow = {
  id: string;
  question: string;
  answer: string | null;
  created_at: string;
  answered_at: string | null;
  user_id: string;
};

export function ProductQnA({ productId }: { productId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const askFn = useServerFn(askProductQuestion);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: rows } = useQuery({
    queryKey: ["product-questions", productId, user?.id ?? "anon"],
    queryFn: async () => {
      const { data } = await supabase
        // biome-ignore lint/suspicious/noExplicitAny: table not yet in generated types
        .from("product_questions" as any)
        .select("id, question, answer, created_at, answered_at, user_id")
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .limit(30);
      return (data ?? []) as unknown as QRow[];
    },
  });

  const submit = async () => {
    if (!user) {
      toast("Soru sormak için giriş yap");
      return;
    }
    if (text.trim().length < 5) {
      toast.error("Soru en az 5 karakter olmalı");
      return;
    }
    setBusy(true);
    try {
      await askFn({ data: { productId, question: text.trim() } });
      setText("");
      toast.success("Sorun alındı — cevaplayınca bildirim göndereceğiz");
      qc.invalidateQueries({ queryKey: ["product-questions", productId] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const list = rows ?? [];

  return (
    <section className="glass-card rounded-xl border border-primary/20 p-5">
      <div className="mb-4 flex items-center gap-2 font-mono text-sm">
        <MessageCircleQuestion className="h-4 w-4 text-primary" />
        <span className="neon-text">soru & cevap</span>
        <span className="text-muted-foreground text-xs">· {list.filter((q) => q.answer).length} cevaplandı</span>
      </div>

      <div className="mb-5 space-y-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={user ? "Bu ürün hakkında merak ettiğin bir şey mi var?" : "Soru sormak için giriş yapmalısın"}
          disabled={!user || busy}
          rows={3}
          className="font-mono text-sm bg-background/60 border-primary/20"
        />
        <div className="flex justify-end">
          <Button onClick={submit} disabled={busy || !user} size="sm" className="font-mono">
            {busy ? "gönderiliyor…" : "$ soru gönder"}
          </Button>
        </div>
      </div>

      {list.length === 0 ? (
        <p className="font-mono text-xs text-muted-foreground">Henüz soru yok — ilk soranı sen ol.</p>
      ) : (
        <ul className="space-y-3">
          {list.map((q) => (
            <li key={q.id} className="rounded-lg border border-border/50 bg-background/40 p-3">
              <div className="flex items-start gap-2">
                <span className="font-mono text-xs text-primary shrink-0">S:</span>
                <p className="text-sm">{q.question}</p>
              </div>
              {q.answer ? (
                <div className="mt-2 flex items-start gap-2 rounded-md border border-primary/25 bg-primary/5 p-2.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-wider text-primary/80">SiberPHP ekibi</div>
                    <p className="text-sm mt-0.5 whitespace-pre-wrap">{q.answer}</p>
                  </div>
                </div>
              ) : (
                <div className="mt-2 inline-flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                  <Clock className="h-3 w-3" /> cevap bekleniyor
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
