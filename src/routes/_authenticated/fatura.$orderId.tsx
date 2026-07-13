import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { useEffect } from "react";
import { Printer, ArrowLeft } from "lucide-react";

const getInvoiceData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => v as { orderId: string })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });

    // 1) Fatura satırı (varsa)
    let invoiceQuery = context.supabase
      .from("invoices")
      .select(
        "invoice_number, issued_at, buyer_name, buyer_email, buyer_tax_id, buyer_address, subtotal_try, vat_rate, vat_amount_try, total_try, items_snapshot",
      )
      .eq("order_id", data.orderId);

    if (!isAdmin) invoiceQuery = invoiceQuery.eq("user_id", context.userId);

    const { data: invoice } = await invoiceQuery.maybeSingle();

    // 2) Sipariş kimliği + kalemler (fatura yoksa da yazdırabilelim)
    let orderQuery = context.supabase
      .from("orders")
      .select(
        "id, reference_code, price_try, status, created_at, product:products(name), items:order_items(quantity, product_name_snapshot, unit_price_try), user:profiles!orders_user_id_fkey(email)",
      )
      .eq("id", data.orderId);

    if (!isAdmin) orderQuery = orderQuery.eq("user_id", context.userId);

    const { data: order, error } = await orderQuery.maybeSingle();

    if (error || !order) throw notFound();

    return { order, invoice };
  });

export const Route = createFileRoute("/_authenticated/fatura/$orderId")({
  component: Invoice,
  loader: ({ params }) => getInvoiceData({ data: { orderId: params.orderId } }),
  head: () => ({
    meta: [
      { title: "Fatura — SiberPHP" },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: () => <div className="p-8 text-center">Sipariş bulunamadı</div>,
  notFoundComponent: () => <div className="p-8 text-center">Sipariş bulunamadı</div>,
});

type LoaderData = {
  order: {
    id: string;
    reference_code: string;
    price_try: number;
    status: string;
    created_at: string;
    buyer_email: string | null;
    product: { name: string } | null;
    items: { quantity: number; product_name_snapshot: string; unit_price_try: number }[] | null;
  };
  invoice: {
    invoice_number: string;
    issued_at: string;
    buyer_name: string | null;
    buyer_email: string | null;
    buyer_tax_id: string | null;
    buyer_address: string | null;
    subtotal_try: number;
    vat_rate: number;
    vat_amount_try: number;
    total_try: number;
    items_snapshot: {
      name: string;
      quantity: number;
      unit_price_try: number;
      line_total_try: number;
    }[];
  } | null;
};

function Invoice() {
  const { order, invoice } = Route.useLoaderData() as LoaderData;

  useEffect(() => {
    document.body.classList.add("bg-white");
    return () => document.body.classList.remove("bg-white");
  }, []);

  // Fatura yoksa siparişten türet (KDV %20 dahil)
  const total = Number(invoice?.total_try ?? order.price_try);
  const subtotal = Number(
    invoice?.subtotal_try ?? Math.round((total / 1.2) * 100) / 100,
  );
  const vat = Number(
    invoice?.vat_amount_try ?? Math.round((total - subtotal) * 100) / 100,
  );
  const vatRate = Number(invoice?.vat_rate ?? 20);

  const items = invoice?.items_snapshot?.length
    ? invoice.items_snapshot.map((it) => ({
        name: it.name,
        qty: it.quantity,
        unit: Number(it.unit_price_try),
        total: Number(it.line_total_try),
      }))
    : (order.items ?? []).length > 0
      ? (order.items ?? []).map((it) => ({
          name: it.product_name_snapshot,
          qty: it.quantity,
          unit: Number(it.unit_price_try),
          total: Number(it.unit_price_try) * it.quantity,
        }))
      : [
          {
            name: order.product?.name ?? "Ürün",
            qty: 1,
            unit: Number(order.price_try),
            total: Number(order.price_try),
          },
        ];

  const invoiceNumber = invoice?.invoice_number ?? `(${order.reference_code})`;
  const issued = invoice?.issued_at ?? order.created_at;
  const buyerName = invoice?.buyer_name ?? "Bireysel Müşteri";
  const buyerEmail = invoice?.buyer_email ?? order.buyer_email;
  const buyerTax = invoice?.buyer_tax_id;
  const buyerAddress = invoice?.buyer_address;

  return (
    <>
      <div className="max-w-3xl mx-auto p-8 bg-white text-black print:p-4 print:max-w-none">
        <div className="flex justify-between items-start border-b-2 border-black pb-4">
          <div>
            <div className="text-3xl font-bold tracking-tight">SiberPHP</div>
            <div className="text-xs mt-1">Dijital Lisans Satışı</div>
            <div className="text-xs">siberlisans.lovable.app</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">FATURA</div>
            <div className="text-xs mt-1 font-mono">{invoiceNumber}</div>
            <div className="text-xs">
              Düzenleme: {new Date(issued).toLocaleDateString("tr-TR")}
            </div>
            <div className="text-[10px] text-gray-600 mt-0.5">
              Sipariş: {order.reference_code}
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-[10px] uppercase text-gray-500 tracking-wider">
              Alıcı
            </div>
            <div className="font-semibold mt-1">{buyerName}</div>
            {buyerEmail && <div>{buyerEmail}</div>}
            {buyerTax && <div className="text-xs">VKN/TCKN: {buyerTax}</div>}
            {buyerAddress && (
              <div className="text-xs mt-1 whitespace-pre-line">{buyerAddress}</div>
            )}
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase text-gray-500 tracking-wider">
              Satıcı
            </div>
            <div className="font-semibold mt-1">SiberPHP</div>
            <div className="text-xs">Dijital Lisans Platformu</div>
            <div className="text-xs">iletisim@siberlisans.com</div>
          </div>
        </div>

        <table className="w-full mt-6 text-sm border-collapse">
          <thead>
            <tr className="border-b border-black">
              <th className="text-left py-2">Açıklama</th>
              <th className="text-right py-2 w-16">Adet</th>
              <th className="text-right py-2 w-28">Birim</th>
              <th className="text-right py-2 w-28">Toplam</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-b border-gray-200">
                <td className="py-2">{it.name}</td>
                <td className="text-right py-2">{it.qty}</td>
                <td className="text-right py-2">₺{it.unit.toFixed(2)}</td>
                <td className="text-right py-2">₺{it.total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="text-right py-1 text-xs text-gray-600">
                Matrah
              </td>
              <td className="text-right py-1 text-xs">₺{subtotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td colSpan={3} className="text-right py-1 text-xs text-gray-600">
                KDV (%{vatRate.toFixed(0)})
              </td>
              <td className="text-right py-1 text-xs">₺{vat.toFixed(2)}</td>
            </tr>
            <tr className="border-t-2 border-black font-bold">
              <td colSpan={3} className="text-right py-2">
                GENEL TOPLAM
              </td>
              <td className="text-right py-2">₺{total.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="mt-8 text-[11px] text-gray-600 leading-relaxed">
          <div>Sipariş durumu: {order.status}</div>
          <div className="mt-3">
            Bu belge SiberPHP tarafından dijital olarak oluşturulmuştur ve resmi e-Fatura yerine geçmez;
            bilgi ve arşiv amaçlıdır. KDV %{vatRate.toFixed(0)} tutara dahildir.
          </div>
        </div>

        <div className="mt-8 print:hidden flex flex-wrap gap-3 items-center justify-between">
          <Link
            to="/faturalar"
            className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-black"
          >
            <ArrowLeft className="h-3 w-3" /> faturalarım
          </Link>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded bg-black text-white text-sm hover:bg-gray-800"
          >
            <Printer className="h-4 w-4" /> Yazdır / PDF olarak indir
          </button>
        </div>
      </div>
    </>
  );
}
