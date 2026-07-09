import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { useEffect } from "react";
import { Printer } from "lucide-react";

const getInvoice = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => v as { orderId: string })
  .handler(async ({ data, context }) => {
    const { data: order, error } = await context.supabase
      .from("orders")
      .select(
        "id, reference_code, price_try, status, created_at, buyer_email, product:products(name, price_try), items:order_items(quantity, product_name_snapshot, unit_price_try)",
      )
      .eq("id", data.orderId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error || !order) throw notFound();
    return order;
  });

export const Route = createFileRoute("/_authenticated/fatura/$orderId")({
  component: Invoice,
  loader: ({ params }) => getInvoice({ data: { orderId: params.orderId } }),
  head: () => ({ meta: [{ title: "Fatura — SiberPHP" }, { name: "robots", content: "noindex" }] }),
  errorComponent: () => <div className="p-8 text-center">Sipariş bulunamadı</div>,
  notFoundComponent: () => <div className="p-8 text-center">Sipariş bulunamadı</div>,
});

function Invoice() {
  const o = Route.useLoaderData();
  useEffect(() => {
    document.body.classList.add("bg-white");
    return () => document.body.classList.remove("bg-white");
  }, []);

  const items =
    (o.items ?? []).length > 0
      ? o.items!.map((it) => ({
          name: it.product_name_snapshot,
          qty: it.quantity,
          unit: Number(it.unit_price_try),
          total: Number(it.unit_price_try) * it.quantity,
        }))
      : [
          {
            name: o.product?.name ?? "Ürün",
            qty: 1,
            unit: Number(o.price_try),
            total: Number(o.price_try),
          },
        ];

  return (
    <div className="max-w-3xl mx-auto p-8 bg-white text-black print:p-4">
      <div className="flex justify-between items-start border-b-2 border-black pb-4">
        <div>
          <div className="text-3xl font-bold">SiberPHP</div>
          <div className="text-xs mt-1">Dijital Lisans Satışı</div>
          <div className="text-xs">siberlisans.lovable.app</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">FATURA</div>
          <div className="text-xs mt-1 font-mono">{o.reference_code}</div>
          <div className="text-xs">{new Date(o.created_at).toLocaleDateString("tr-TR")}</div>
        </div>
      </div>

      <div className="mt-6 text-sm">
        <div className="font-semibold">Sayın Müşteri</div>
        <div>{o.buyer_email ?? "-"}</div>
      </div>

      <table className="w-full mt-6 text-sm border-collapse">
        <thead>
          <tr className="border-b border-black">
            <th className="text-left py-2">Açıklama</th>
            <th className="text-right py-2 w-16">Adet</th>
            <th className="text-right py-2 w-24">Birim</th>
            <th className="text-right py-2 w-24">Toplam</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} className="border-b border-gray-300">
              <td className="py-2">{it.name}</td>
              <td className="text-right py-2">{it.qty}</td>
              <td className="text-right py-2">₺{it.unit.toFixed(2)}</td>
              <td className="text-right py-2">₺{it.total.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-black font-bold">
            <td colSpan={3} className="text-right py-2">
              GENEL TOPLAM
            </td>
            <td className="text-right py-2">₺{Number(o.price_try).toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>

      <div className="mt-8 text-[11px] text-gray-600">
        <div>Durum: {o.status}</div>
        <div className="mt-4">
          Bu belge dijital olarak oluşturulmuştur. Resmi e-fatura yerine geçmez; bilgi ve arşiv amaçlıdır.
        </div>
      </div>

      <div className="mt-8 print:hidden flex gap-3">
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded bg-black text-white text-sm"
        >
          <Printer className="h-4 w-4" /> Yazdır / PDF
        </button>
      </div>
    </div>
  );
}
