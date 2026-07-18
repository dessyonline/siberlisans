import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Shield, ShieldOff, Ban, AlertTriangle, Globe2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listBlockedIps,
  listSuspiciousIps,
  blockIp,
  unblockIp,
} from "@/lib/ip-admin.functions";

export const Route = createFileRoute("/_authenticated/admin/ip-yonetim")({
  component: IpAdminPage,
});

function IpAdminPage() {
  const qc = useQueryClient();
  const listBlocked = useServerFn(listBlockedIps);
  const listSusp = useServerFn(listSuspiciousIps);
  const blockFn = useServerFn(blockIp);
  const unblockFn = useServerFn(unblockIp);

  const blocked = useQuery({ queryKey: ["ip-blocked"], queryFn: () => listBlocked({}) });
  const suspicious = useQuery({ queryKey: ["ip-suspicious"], queryFn: () => listSusp({}) });

  const [ip, setIp] = useState("");
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState(24);

  const doBlock = useMutation({
    mutationFn: (v: { ip: string; reason?: string; hours: number }) => blockFn({ data: v }),
    onSuccess: () => {
      toast.success("IP bloklandı");
      setIp(""); setReason("");
      qc.invalidateQueries({ queryKey: ["ip-blocked"] });
      qc.invalidateQueries({ queryKey: ["ip-suspicious"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doUnblock = useMutation({
    mutationFn: (v: { ip: string }) => unblockFn({ data: v }),
    onSuccess: () => {
      toast.success("Blok kaldırıldı");
      qc.invalidateQueries({ queryKey: ["ip-blocked"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="glass-card p-4 rounded-lg">
        <h1 className="font-mono text-sm text-primary neon-text flex items-center gap-2">
          <Shield className="h-4 w-4" /> ip_management :: control_panel
        </h1>
        <p className="font-mono text-[11px] text-muted-foreground mt-1">
          Şüpheli IP'leri elle blokla, aktif blokları yönet.
        </p>
      </div>

      {/* Manuel blok */}
      <div className="glass-card p-4 rounded-lg space-y-3">
        <div className="font-mono text-xs text-primary flex items-center gap-2">
          <Ban className="h-3.5 w-3.5" /> manuel_blok
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_120px_auto] gap-2">
          <Input
            placeholder="IP (örn 1.2.3.4)"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            className="font-mono text-xs"
          />
          <Input
            placeholder="sebep (opsiyonel)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="font-mono text-xs"
          />
          <Input
            type="number"
            min={1}
            max={720}
            value={hours}
            onChange={(e) => setHours(Number(e.target.value) || 24)}
            className="font-mono text-xs"
            placeholder="saat"
          />
          <Button
            onClick={() => ip && doBlock.mutate({ ip: ip.trim(), reason: reason.trim() || undefined, hours })}
            disabled={!ip || doBlock.isPending}
            className="font-mono neon-glow"
          >
            blokla
          </Button>
        </div>
      </div>

      {/* Şüpheli IP'ler */}
      <div className="glass-card p-4 rounded-lg space-y-3">
        <div className="font-mono text-xs text-warn flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5" /> supheli_ip'ler (son 24 saat)
        </div>
        {suspicious.isLoading ? (
          <div className="font-mono text-[11px] text-muted-foreground">yükleniyor...</div>
        ) : (suspicious.data?.rows ?? []).length === 0 ? (
          <div className="font-mono text-[11px] text-muted-foreground">Şüpheli aktivite yok.</div>
        ) : (
          <div className="space-y-1.5">
            {suspicious.data!.rows.map((r) => (
              <div key={r.ip} className="flex items-center justify-between gap-2 rounded border border-border/40 bg-black/20 px-3 py-2 font-mono text-[11px]">
                <div className="flex items-center gap-2 min-w-0">
                  <Globe2 className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-foreground truncate">{r.ip}</span>
                  {r.country && <span className="text-muted-foreground">· {r.country}</span>}
                  {r.vpn && <span className="rounded bg-destructive/20 text-destructive px-1.5 py-0.5">VPN</span>}
                  <span className="text-muted-foreground">
                    · {r.rejected} red / {r.total} toplam
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => doBlock.mutate({ ip: r.ip, reason: "otomatik: şüpheli", hours: 24 })}
                  className="font-mono text-[10px] h-7"
                >
                  blokla 24s
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Aktif bloklar */}
      <div className="glass-card p-4 rounded-lg space-y-3">
        <div className="font-mono text-xs text-primary flex items-center gap-2">
          <Shield className="h-3.5 w-3.5" /> aktif_bloklar
        </div>
        {blocked.isLoading ? (
          <div className="font-mono text-[11px] text-muted-foreground">yükleniyor...</div>
        ) : (blocked.data?.rows ?? []).length === 0 ? (
          <div className="font-mono text-[11px] text-muted-foreground">Aktif blok yok.</div>
        ) : (
          <div className="space-y-1.5">
            {blocked.data!.rows.map((r: any) => (
              <div key={r.ip} className="flex items-center justify-between gap-2 rounded border border-warn/30 bg-warn/5 px-3 py-2 font-mono text-[11px]">
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground">{r.ip}</span>
                    <span className="text-muted-foreground">· {r.reason ?? "—"}</span>
                  </div>
                  <div className="text-muted-foreground/70 text-[10px]">
                    bitiş: {new Date(r.blocked_until).toLocaleString("tr-TR")}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => doUnblock.mutate({ ip: r.ip })}
                  className="font-mono text-[10px] h-7"
                >
                  <ShieldOff className="h-3 w-3 mr-1" /> kaldır
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
