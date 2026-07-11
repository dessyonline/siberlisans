import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listAuditLog } from "@/lib/admin-audit.functions";
import { Loader2, Search, Shield, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/denetim")({
  ssr: false,
  component: AuditPage,
  head: () => ({ meta: [{ title: "Denetim Kaydı — Admin" }, { name: "robots", content: "noindex, nofollow" }] }),
});

type Row = {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_data: unknown;
  after_data: unknown;
  metadata: unknown;
  created_at: string;
};

function AuditPage() {
  const listFn = useServerFn(listAuditLog);
  const [search, setSearch] = useState("");
  const [entity, setEntity] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["audit-log", search, entity],
    queryFn: () => listFn({ data: { limit: 200, search: search || undefined, entity_type: entity || undefined } }),
  });

  const rows = (data ?? []) as Row[];

  return (
    <div className="space-y-4">
      <div>
        <div className="font-mono text-xs text-muted-foreground">$ /admin/denetim<span className="terminal-caret" /></div>
        <h1 className="mt-1 flex items-center gap-2 text-xl font-bold neon-text md:text-2xl">
          <Shield className="h-5 w-5" /> Denetim Kaydı
        </h1>
        <p className="text-xs text-muted-foreground mt-1">Adminlerin yaptığı fiyat, rol, ürün ve sistem değişiklikleri.</p>
      </div>

      <div className="glass-card rounded-lg p-3 flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-1 flex-1 min-w-[200px]">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="aksiyon / entity id / email"
            className="flex-1 rounded border border-primary/30 bg-background/40 px-2 py-1.5 font-mono text-xs"
          />
        </div>
        <select
          value={entity}
          onChange={(e) => setEntity(e.target.value)}
          className="rounded border border-primary/30 bg-background/40 px-2 py-1.5 font-mono text-xs"
        >
          <option value="">tüm entity'ler</option>
          <option value="product">product</option>
          <option value="order">order</option>
          <option value="user">user</option>
          <option value="role">role</option>
          <option value="wallet">wallet</option>
          <option value="setting">setting</option>
        </select>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </div>

      <div className="glass-card rounded-lg overflow-hidden">
        <table className="w-full text-xs font-mono">
          <thead className="bg-primary/5 text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">zaman</th>
              <th className="text-left px-3 py-2">admin</th>
              <th className="text-left px-3 py-2">aksiyon</th>
              <th className="text-left px-3 py-2">hedef</th>
              <th className="text-left px-3 py-2">detay</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !isFetching && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  kayıt yok
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <>
                <tr
                  key={r.id}
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                  className="border-t border-border/40 cursor-pointer hover:bg-primary/5"
                >
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString("tr-TR")}
                  </td>
                  <td className="px-3 py-2 text-primary">{r.actor_email ?? r.actor_id?.slice(0, 8) ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-primary/10 border border-primary/30 px-1.5 py-0.5">{r.action}</span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.entity_type}{r.entity_id ? ` · ${r.entity_id.slice(0, 8)}` : ""}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {expanded === r.id ? "kapat" : "aç"}
                  </td>
                </tr>
                {expanded === r.id && (
                  <tr key={r.id + "-x"} className="border-t border-border/40 bg-background/40">
                    <td colSpan={5} className="px-3 py-3">
                      <div className="grid gap-2 md:grid-cols-3">
                        <Block title="önce" v={r.before_data} />
                        <Block title="sonra" v={r.after_data} />
                        <Block title="metadata" v={r.metadata} />
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Block({ title, v }: { title: string; v: unknown }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground mb-1">{title}</div>
      <pre className="text-[10px] bg-black/30 rounded border border-border/40 p-2 overflow-auto max-h-48">
        {v ? JSON.stringify(v, null, 2) : "—"}
      </pre>
    </div>
  );
}
