import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DeliveryPayload, type DeliveryType } from "@/components/DeliveryPayload";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ShieldCheck, XCircle, Terminal } from "lucide-react";

export const Route = createFileRoute("/aktivasyon/$token")({
  component: ActivationPage,
  head: () => ({ meta: [{ title: "Aktivasyon — SiberPHP" }] }),
});

function ActivationPage() {
  const { token } = Route.useParams();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["activation", token],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("license_keys")
        .select("id, key_value, activation_token, claimed_at, product:products(name, delivery_type)")
        .eq("activation_token", token)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Mark claimed on first successful load
  useEffect(() => {
    if (data && !data.claimed_at) {
      supabase
        .from("license_keys")
        .update({ claimed_at: new Date().toISOString() })
        .eq("activation_token", token)
        .then(() => qc.invalidateQueries({ queryKey: ["activation", token] }));
    }
  }, [data, token, qc]);

  if (isLoading) {
    return <div className="mx-auto max-w-md px-4 py-16 text-center font-mono text-muted-foreground">yükleniyor…</div>;
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="glass-card rounded-lg p-8 text-center">
          <XCircle className="mx-auto h-10 w-10 text-destructive" />
          <h1 className="mt-3 font-mono text-xl neon-text">Geçersiz Token</h1>
          <p className="mt-2 text-sm text-muted-foreground font-mono">
            Bu aktivasyon linki bulunamadı veya süresi dolmuş.
          </p>
          <Button asChild className="mt-6 font-mono">
            <Link to="/">anasayfaya dön</Link>
          </Button>
        </div>
      </div>
    );
  }

  const dt = (data.product?.delivery_type ?? "key") as DeliveryType;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="glass-card rounded-t-lg border-b-0 px-4 py-2 flex items-center gap-2 font-mono text-xs">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-warn/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-primary/80" />
        <span className="ml-3 text-muted-foreground">
          <Terminal className="inline h-3 w-3 mr-1" />
          siberphp@secure:~/activate/{token.slice(0, 10)}
        </span>
      </div>

      <div className="glass-card rounded-b-lg rounded-t-none p-6 scan-line neon-glow">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-[10px] tracking-widest text-muted-foreground">
              secure_channel · verified
            </div>
            <h1 className="mt-1 font-mono text-2xl neon-text">Aktivasyon</h1>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{data.product?.name}</p>
          </div>
          <CheckCircle2 className="h-10 w-10 text-primary" />
        </div>

        <div className="mt-6">
          <DeliveryPayload
            deliveryType={dt === "link_token" ? "key" : dt}
            keyValue={data.key_value}
            activationToken={data.activation_token}
          />
        </div>

        {data.claimed_at && (
          <div className="mt-4 font-mono text-[11px] text-muted-foreground">
            ilk açılış: {new Date(data.claimed_at).toLocaleString("tr-TR")}
          </div>
        )}

        <div className="mt-6 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Bu link sana özel — kimseyle paylaşma.
        </div>
      </div>
    </div>
  );
}
