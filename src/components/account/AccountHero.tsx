import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Check, Pencil, Sparkles, Wallet, Trophy, X } from "lucide-react";

const TIER_LABEL: Record<string, { l: string; c: string }> = {
  bronze: { l: "Bronz", c: "text-amber-600" },
  silver: { l: "Gümüş", c: "text-slate-300" },
  gold: { l: "Altın", c: "text-yellow-400" },
  platinum: { l: "Platin", c: "text-primary" },
};

export function AccountHero({
  userId,
  email,
  aiCredits,
}: {
  userId: string;
  email: string;
  aiCredits: { remaining: number; total: number } | null;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["account-hero", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name, avatar_id, tier, total_points, created_at")
        .eq("id", userId)
        .maybeSingle();
      return data ?? null;
    },
  });

  const { data: wallet } = useQuery({
    queryKey: ["wallet", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("wallets")
        .select("balance_try")
        .eq("user_id", userId)
        .maybeSingle();
      return data ?? { balance_try: 0 };
    },
    refetchInterval: 8000,
  });

  useEffect(() => {
    setName(profile?.display_name ?? "");
  }, [profile?.display_name]);

  const saveName = async () => {
    const val = name.trim();
    if (val.length < 2) return toast.error("[!] en az 2 karakter");
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ display_name: val }).eq("id", userId);
    setSaving(false);
    if (error) return toast.error(`[!] ${error.message}`);
    toast.success("[✓] görünen ad güncellendi");
    setEditing(false);
    qc.invalidateQueries({ queryKey: ["account-hero", userId] });
  };

  const tier = TIER_LABEL[(profile?.tier as string) ?? "bronze"] ?? TIER_LABEL.bronze;
  const balance = Number(wallet?.balance_try ?? 0);
  const points = Number(profile?.total_points ?? 0);

  return (
    <div className="glass-card corner-cut neon-glow relative overflow-hidden rounded-lg p-4 md:p-6">
      <div className="cyber-grid pointer-events-none absolute inset-0 opacity-25" />
      <div className="scan-line pointer-events-none absolute inset-0 opacity-40" />

      <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-full border border-primary/40 p-0.5 neon-glow shrink-0">
            <UserAvatar id={profile?.avatar_id ?? null} size={56} />
          </div>
          <div className="min-w-0">
            {editing ? (
              <div className="flex items-center gap-1.5">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="görünen ad"
                  className="h-8 w-40 font-mono text-sm"
                  autoFocus
                />
                <Button size="sm" className="h-8 w-8 p-0" disabled={saving} onClick={saveName}>
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={() => {
                    setEditing(false);
                    setName(profile?.display_name ?? "");
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="group flex items-center gap-2 text-left"
              >
                <span className="truncate font-mono text-lg font-bold neon-text md:text-xl">
                  {profile?.display_name || email.split("@")[0]}
                </span>
                <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition group-hover:text-primary" />
              </button>
            )}
            <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{email}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px]">
              <span className={`rounded-full border border-border/60 px-2 py-0.5 ${tier.c}`}>
                <Trophy className="mr-1 inline h-3 w-3" />
                {tier.l}
              </span>
              {profile?.created_at && (
                <span className="text-muted-foreground">
                  üye: {new Date(profile.created_at).toLocaleDateString("tr-TR")}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 font-mono">
          <Link
            to="/cuzdan"
            className="glass-card rounded-md px-3 py-2 transition hover:neon-glow"
          >
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              <Wallet className="h-3 w-3 text-primary" /> bakiye
            </div>
            <div className="mt-0.5 truncate text-sm font-bold text-primary">
              {balance.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺
            </div>
          </Link>
          <Link
            to="/paketler/ai"
            className="glass-card rounded-md px-3 py-2 transition hover:neon-glow"
          >
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              <Sparkles className="h-3 w-3 text-primary" /> ai kredi
            </div>
            <div className="mt-0.5 truncate text-sm font-bold text-primary">
              {aiCredits ? `${aiCredits.remaining}/${aiCredits.total}` : "paket al →"}
            </div>
          </Link>
          <Link
            to="/gorevler"
            className="glass-card rounded-md px-3 py-2 transition hover:neon-glow"
          >
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              <Trophy className="h-3 w-3 text-primary" /> puan
            </div>
            <div className="mt-0.5 truncate text-sm font-bold text-primary">
              {points.toLocaleString("tr-TR")}
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
