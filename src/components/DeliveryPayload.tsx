import { useState } from "react";
import { Copy, KeyRound, Mail, Link as LinkIcon, ExternalLink, Lock, Download } from "lucide-react";
import { toast } from "sonner";

export type DeliveryType = "key" | "account" | "link" | "link_token";

export interface DeliveryPayloadProps {
  deliveryType: DeliveryType;
  keyValue: string;
  activationToken?: string | null;
  origin?: string;
  compact?: boolean;
}

function copy(v: string, label: string) {
  navigator.clipboard.writeText(v);
  toast.success(`${label} kopyalandı`);
}

function parseAccount(v: string): { email: string; password: string } {
  const idx = v.indexOf(":");
  if (idx <= 0) return { email: v, password: "" };
  return { email: v.slice(0, idx).trim(), password: v.slice(idx + 1).trim() };
}

export function DeliveryPayload({
  deliveryType,
  keyValue,
  activationToken,
  origin,
  compact,
}: DeliveryPayloadProps) {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");

  if (deliveryType === "account") {
    const { email, password } = parseAccount(keyValue);
    return (
      <div className={`rounded border border-primary/30 bg-primary/5 p-3 space-y-2 font-mono text-sm ${compact ? "" : "p-4"}`}>
        <Row icon={<Mail className="h-4 w-4" />} label="email" value={email} />
        <Row icon={<Lock className="h-4 w-4" />} label="şifre" value={password} mono />
      </div>
    );
  }

  if (deliveryType === "link") {
    return (
      <a
        href={keyValue}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 rounded border border-primary/30 bg-primary/5 px-3 py-2 font-mono text-primary text-sm hover:bg-primary/10"
      >
        <LinkIcon className="h-4 w-4" />
        <span className="flex-1 break-all truncate">{keyValue}</span>
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    );
  }

  if (deliveryType === "link_token" && activationToken) {
    const url = `${base}/aktivasyon/${activationToken}`;
    return (
      <div className="rounded border border-primary/30 bg-primary/5 p-3 font-mono text-sm space-y-2">
        <div className="text-[10px] tracking-widest text-muted-foreground">aktivasyon linkin</div>
        <div className="flex items-center gap-2">
          <code className="flex-1 break-all text-primary">{url}</code>
          <button onClick={() => copy(url, "Link")}><Copy className="h-3.5 w-3.5" /></button>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" /> linki aç
        </a>
      </div>
    );
  }

  // default: key
  return (
    <div className="flex items-center gap-2 rounded border border-primary/30 bg-primary/5 px-3 py-2 font-mono text-primary text-sm">
      <KeyRound className="h-4 w-4" />
      <code className="flex-1 break-all">{keyValue}</code>
      <button onClick={() => copy(keyValue, "Key")}>
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function Row({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  const [show, setShow] = useState(true);
  return (
    <div className="flex items-center gap-2">
      <span className="text-primary">{icon}</span>
      <span className="text-[10px] tracking-widest text-muted-foreground w-14 uppercase">{label}</span>
      <code className={`flex-1 break-all text-primary ${mono ? "" : ""}`}>
        {mono && !show ? "••••••••" : value || "—"}
      </code>
      {mono && (
        <button onClick={() => setShow((s) => !s)} className="text-muted-foreground hover:text-primary text-[10px]">
          {show ? "gizle" : "göster"}
        </button>
      )}
      {value && (
        <button onClick={() => copy(value, label)} className="text-muted-foreground hover:text-primary">
          <Copy className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
