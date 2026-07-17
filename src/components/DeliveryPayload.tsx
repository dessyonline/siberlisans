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

  if (deliveryType === "link_token") {
    // Havuza gerçek bir aktivasyon linki (http/https) yüklendiyse, token sayfası yerine
    // doğrudan o linki müşteriye göster.
    const raw = (keyValue ?? "").trim();
    const isRealUrl = /^https?:\/\//i.test(raw);
    if (isRealUrl) {
      return (
        <a
          href={raw}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded border border-primary/30 bg-primary/5 px-3 py-2 font-mono text-primary text-sm hover:bg-primary/10"
        >
          <LinkIcon className="h-4 w-4" />
          <span className="flex-1 break-all truncate">{raw}</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      );
    }
    if (activationToken) {
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
  }


  // URL key (ör. sınırsız stok davet linki) — link olarak render et
  const isUrl = /^https?:\/\//i.test(keyValue.trim());
  if (isUrl) {
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

  // default: key
  const isLovable = /^(SIBER|LVBL)-/i.test(keyValue);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded border border-primary/30 bg-primary/5 px-3 py-2 font-mono text-primary text-sm">
        <KeyRound className="h-4 w-4" />
        <code className="flex-1 break-all">{keyValue}</code>
        <button onClick={() => copy(keyValue, "Key")}>
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
      {isLovable && (
        <button
          onClick={() => downloadLovableUserscript(keyValue)}
          className="flex w-full items-center justify-center gap-2 rounded border border-cyan/40 bg-cyan/5 px-3 py-2 font-mono text-xs text-cyan hover:bg-cyan/10"
        >
          <Download className="h-3.5 w-3.5" />
          Tampermonkey scriptini indir (.user.js)
        </button>
      )}
    </div>
  );
}


function downloadLovableUserscript(licenseKey: string) {
  const script = `// ==UserScript==
// @name         Lovable Sınırsız — Kredisiz
// @namespace    https://siberlisans.lovable.app
// @version      1.0.0
// @match        https://lovable.dev/*
// @match        https://*.lovable.dev/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==
(function(){"use strict";
  const API="https://siberlisans.lovable.app",KEY="${licenseKey}";
  const hwid=(()=>{let h=GM_getValue("siber_hwid",null);if(!h){h=crypto.randomUUID();GM_setValue("siber_hwid",h);}return h;})();
  const post=(p,b)=>fetch(API+p,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)}).then(r=>r.json());
  (async()=>{try{
    const act=GM_getValue("siber_activated",false),last=Number(GM_getValue("siber_last_check",0));
    if(!act){const r=await post("/api/activate",{license_key:KEY,hwid});if(!r.success)throw new Error(r.error);GM_setValue("siber_activated",true);GM_setValue("siber_last_check",Date.now());}
    else if(Date.now()-last>6*3600*1000){const r=await post("/api/validate",{license_key:KEY,hwid});if(!r.valid)throw new Error(r.error);GM_setValue("siber_last_check",Date.now());}
  }catch(e){alert("Lisans hatası: "+e.message);}})();
})();`;
  const blob = new Blob([script], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lovable-lisans-${licenseKey.slice(-8)}.user.js`;
  a.click();
  URL.revokeObjectURL(url);
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
