import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { answerProductQuestion, deleteProductQuestion, listAllProductQuestions } from "@/lib/product-qa.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { MessageCircleQuestion, Trash2, Send } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/sorular")({
  head: () => ({
    meta: [
      { title: "Ürün Soruları | Yönetim" },
      { name: "description", content: "Müşterilerin ürünler hakkında sorduğu soruları yanıtla ve yayınla." },
      { property: "og:title", content: "Ürün Soruları | Yönetim" },
      { property: "og:description", content: "Müşteri sorularını yanıtla ve yayınla." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminQuestions,
});

type Row = {
  id: string;
  product_id: string;
  user_id: string;
  question: string;
  answer: string | null;
  created_at: string;
  products: { name: string; slug: string } | null;
};

function AdminQuestions() {
  const qc = useQueryClient();
  const answerFn = useServerFn(answerProductQuestion);
  const deleteFn = useServerFn(deleteProductQuestion);
  const listFn = useServerFn(listAllProductQuestions);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<"pending" | "answered">("pending");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-questions", tab],
    queryFn: () => listFn({ data: { tab } }),
  });

  const send = async (id: string) => {
    const answer = (drafts[id] ?? "").trim();
    if (!answer) return toast.error("Cevap boş olamaz");
    try {
      await answerFn({ data: { id, answer } });
      toast.success("Cevap yayınlandı");
      setDrafts((d) => ({ ...d, [id]: "" }));
      qc.invalidateQueries({ queryKey: ["admin-questions"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteFn({ data: { id } });
      toast.success("Silindi");
      qc.invalidateQueries({ queryKey: ["admin-questions"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const rows = data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <MessageCircleQuestion className="h-5 w-5 text-primary" /> Ürün Soruları
        </h1>
        <div className="flex gap-2">
          {(["pending", "answered"] as const).map((t) => (
            <Button
              key={t}
              size="sm"
              variant={tab === t ? "default" : "outline"}
              className="font-mono text-xs"
              onClick={() => setTab(t)}
            >
              {t === "pending" ? "bekleyen" : "cevaplanan"}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="font-mono text-sm text-muted-foreground">yükleniyor…</p>
      ) : rows.length === 0 ? (
        <p className="font-mono text-sm text-muted-foreground">Kayıt yok.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="glass-card rounded-xl border border-border/60 p-4">
              <div className="mb-2 flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <span className="text-primary">{r.products?.name ?? "ürün"}</span>
                <span>{new Date(r.created_at).toLocaleString("tr-TR")}</span>
              </div>
              <p className="text-sm">{r.question}</p>

              {r.answer ? (
                <div className="mt-3 rounded-md border border-primary/25 bg-primary/5 p-3 text-sm whitespace-pre-wrap">
                  {r.answer}
                </div>
              ) : null}

              <div className="mt-3 space-y-2">
                <Textarea
                  rows={2}
                  value={drafts[r.id] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                  placeholder={r.answer ? "cevabı güncelle…" : "cevabını yaz…"}
                  className="font-mono text-xs bg-background/60"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" className="font-mono text-xs" onClick={() => remove(r.id)}>
                    <Trash2 className="mr-1 h-3 w-3" /> sil
                  </Button>
                  <Button size="sm" className="font-mono text-xs" onClick={() => send(r.id)}>
                    <Send className="mr-1 h-3 w-3" /> {r.answer ? "güncelle" : "yayınla"}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
