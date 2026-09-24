import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "@/lib/auth-middleware.server";
import { mysqlQuery, mysqlOne, num, bool } from "@/lib/mysql.server";

// ---------- shared types ----------

export type DashboardStats = {
  totalRev: number;
  todayRev: number;
  totalCost: number;
  totalProfit: number;
  discountTotal: number;
  totalOrders: number;
  pendingCount: number;
  availableKeys: number;
  chart: { date: string; revenue: number; cost: number; profit: number }[];
  lowStock: { id: string; name: string; slug: string; avail: number; unlimited: boolean; manual: boolean; hint: string | null; threshold: number }[];
  messages: { id: string; reference_code: string; created_at: string; user_note: string | null; product: { name: string } | null }[];
  recent: { id: string; status: string; price_try: number; reference_code: string; created_at: string; product: { name: string } | null }[];
  topProducts: { name: string; revenue: number; count: number }[];
};

type OrderRow = {
  id: string;
  price_try: number;
  status: string;
  created_at: string;
  approved_at: string | null;
  user_id: string | null;
  product_id: string | null;
  product_name: string | null;
  product_cost_try: number | null;
  product_external_price: number | null;
};

type DiscountRow = { order_id: string; amount: number };
type ItemCostRow = { order_id: string; amount: number };
type ManualRevRow = { day: string; revenue: number; cost: number };

/** admin_dashboard_financials RPC replacement */
export const getDashboardFinancials = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<{
    total_revenue: number;
    today_revenue: number;
    total_cost: number;
    total_profit: number;
    discount_total: number;
    approved_orders: number;
    chart: { date: string; revenue: number; cost: number; profit: number }[];
  }> => {
    const days = 14;

    const [orders, discountRows, itemCostRows, manualRows] = await Promise.all([
      mysqlQuery<OrderRow>(
        `SELECT o.id, o.price_try, o.status, o.created_at, o.approved_at, o.user_id, o.product_id,
                p.name product_name, p.cost_try product_cost_try, p.external_price product_external_price
           FROM orders o
           LEFT JOIN products p ON p.id = o.product_id
          WHERE o.status = 'approved'
            AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = o.user_id AND ur.role = 'admin')`,
      ),
      mysqlQuery<DiscountRow>(
        `SELECT order_id, COALESCE(SUM(discount_try),0) amount FROM order_discounts GROUP BY order_id`,
      ),
      mysqlQuery<ItemCostRow>(
        `SELECT oi.order_id, COALESCE(SUM(oi.quantity * COALESCE(p.cost_try, p.external_price, 0)),0) amount
           FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id GROUP BY oi.order_id`,
      ),
      mysqlQuery<ManualRevRow>(
        `SELECT DATE(occurred_at) AS day, COALESCE(SUM(amount_try),0) AS revenue, COALESCE(SUM(cost_try),0) AS cost
           FROM manual_revenue_entries GROUP BY DATE(occurred_at)`,
      ),
    ]);

    const discountMap = new Map(discountRows.map((d) => [d.order_id, num(d.amount) ?? 0]));
    const itemCostMap = new Map(itemCostRows.map((d) => [d.order_id, num(d.amount) ?? 0]));

    type DayAgg = { revenue: number; cost: number; discount: number; orders: number };
    const dayMap = new Map<string, DayAgg>();
    const todayKey = new Date().toISOString().slice(0, 10);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (days - 1));
    startDate.setHours(0, 0, 0, 0);
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      dayMap.set(d.toISOString().slice(0, 10), { revenue: 0, cost: 0, discount: 0, orders: 0 });
    }

    let totalRevenue = 0, todayRevenue = 0, totalCost = 0, totalDiscount = 0, approvedOrders = 0;

    for (const o of orders) {
      const dayKey = new Date(o.approved_at ?? o.created_at).toISOString().slice(0, 10);
      const price = num(o.price_try) ?? 0;
      const disc = Math.min(discountMap.get(o.id) ?? 0, price);
      const revenue = Math.max(price - disc, 0);
      const itemCost = itemCostMap.get(o.id) ?? 0;
      const cost = itemCost > 0 ? itemCost : (num(o.product_cost_try) ?? num(o.product_external_price) ?? 0);

      totalRevenue += revenue;
      totalCost += cost;
      totalDiscount += disc;
      approvedOrders += 1;
      if (dayKey === todayKey) todayRevenue += revenue;

      const bucket = dayMap.get(dayKey);
      if (bucket) {
        bucket.revenue += revenue;
        bucket.cost += cost;
        bucket.discount += disc;
        bucket.orders += 1;
      }
    }

    for (const m of manualRows) {
      const dayKey = new Date(m.day).toISOString().slice(0, 10);
      const revenue = num(m.revenue) ?? 0;
      const cost = num(m.cost) ?? 0;
      totalRevenue += revenue;
      totalCost += cost;
      if (dayKey === todayKey) todayRevenue += revenue;
      const bucket = dayMap.get(dayKey);
      if (bucket) {
        bucket.revenue += revenue;
        bucket.cost += cost;
      }
    }

    const chart = Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, v]) => ({
        date: `${day.slice(5, 7)}-${day.slice(8, 10)}`,
        revenue: v.revenue,
        cost: v.cost,
        profit: v.revenue - v.cost,
      }));

    return {
      total_revenue: totalRevenue,
      today_revenue: todayRevenue,
      total_cost: totalCost,
      total_profit: totalRevenue - totalCost,
      discount_total: totalDiscount,
      approved_orders: approvedOrders,
      chart,
    };
  });

/** admin_dashboard_summary RPC replacement */
export const getDashboardSummary = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<{
    today_revenue: number; today_orders: number;
    week_revenue: number; week_orders: number;
    month_revenue: number; month_orders: number;
    pending_count: number; reviewing_count: number;
    avg_basket: number; users_count: number;
  }> => {
    const rows = await mysqlQuery<{ price_try: number; status: string; approved_at: string | null }>(
      `SELECT price_try, status, approved_at FROM orders`,
    );
    const usersRow = await mysqlOne<{ c: number }>(`SELECT COUNT(*) c FROM profiles`);

    const now = Date.now();
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const monthAgo = now - 30 * 24 * 60 * 60 * 1000;

    let todayRevenue = 0, todayOrders = 0;
    let weekRevenue = 0, weekOrders = 0;
    let monthRevenue = 0, monthOrders = 0;
    let pendingCount = 0, reviewingCount = 0;
    let monthSum = 0, monthCount = 0;

    for (const o of rows) {
      if (o.status === "pending") pendingCount++;
      if (o.status === "reviewing") reviewingCount++;
      if (o.status !== "approved" || !o.approved_at) continue;
      const t = new Date(o.approved_at).getTime();
      const price = num(o.price_try) ?? 0;
      if (t >= dayStart.getTime()) { todayRevenue += price; todayOrders++; }
      if (t >= weekAgo) { weekRevenue += price; weekOrders++; }
      if (t >= monthAgo) {
        monthRevenue += price; monthOrders++;
        monthSum += price; monthCount++;
      }
    }

    return {
      today_revenue: todayRevenue,
      today_orders: todayOrders,
      week_revenue: weekRevenue,
      week_orders: weekOrders,
      month_revenue: monthRevenue,
      month_orders: monthOrders,
      pending_count: pendingCount,
      reviewing_count: reviewingCount,
      avg_basket: monthCount > 0 ? monthSum / monthCount : 0,
      users_count: Number(usersRow?.c ?? 0),
    };
  });

/** admin_product_profitability RPC replacement */
export const getProductProfitability = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<{ product_id: string; name: string; sold: number; revenue: number; cost: number; profit: number }[]> => {
    const days = 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const products = await mysqlQuery<{ id: string; name: string; cost_try: number | null }>(
      `SELECT id, name, cost_try FROM products`,
    );
    const orders = await mysqlQuery<{ id: string; product_id: string | null; price_try: number; approved_at: string | null; created_at: string }>(
      `SELECT id, product_id, price_try, approved_at, created_at FROM orders WHERE status='approved' AND COALESCE(approved_at, created_at) >= ?`,
      [since],
    );
    const items = await mysqlQuery<{ order_id: string; product_id: string | null; quantity: number; unit_price_try: number | null }>(
      `SELECT oi.order_id, oi.product_id, oi.quantity, oi.unit_price_try
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.status='approved' AND COALESCE(o.approved_at, o.created_at) >= ?`,
      [since],
    );

    const ordersWithItems = new Set(items.map((i) => i.order_id));

    const agg = new Map<string, { sold: number; revenue: number }>();
    const add = (pid: string | null, qty: number, unitPrice: number) => {
      if (!pid) return;
      const cur = agg.get(pid) ?? { sold: 0, revenue: 0 };
      cur.sold += qty;
      cur.revenue += qty * unitPrice;
      agg.set(pid, cur);
    };

    for (const it of items) {
      add(it.product_id, num(it.quantity) ?? 1, num(it.unit_price_try) ?? 0);
    }
    for (const o of orders) {
      if (ordersWithItems.has(o.id)) continue;
      add(o.product_id, 1, num(o.price_try) ?? 0);
    }

    const result = products
      .map((p) => {
        const a = agg.get(p.id) ?? { sold: 0, revenue: 0 };
        const costPer = num(p.cost_try) ?? 0;
        const cost = a.sold * costPer;
        return {
          product_id: p.id,
          name: p.name,
          sold: a.sold,
          revenue: a.revenue,
          cost,
          profit: a.revenue - cost,
        };
      })
      .filter((p) => p.sold > 0)
      .sort((a, b) => b.profit - a.profit);

    return result;
  });

// ---------- combined dashboard stats (top-of-page cards, chart, tables) ----------

export const getAdminDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<DashboardStats> => {
    const [
      financial,
      pendingRow,
      keysRow,
      lowStockProducts,
      messages,
      recent,
      topProductRows,
    ] = await Promise.all([
      getDashboardFinancials(),
      mysqlOne<{ c: number }>(`SELECT COUNT(*) c FROM orders WHERE status IN ('pending','reviewing')`),
      mysqlOne<{ c: number }>(`SELECT COUNT(*) c FROM license_keys WHERE status='available'`),
      mysqlQuery<{
        id: string; name: string; slug: string; stock_hint: string | null;
        unlimited_stock: number; manual_fulfillment: number; low_stock_threshold: number | null;
        avail: number;
      }>(
        `SELECT p.id, p.name, p.slug, p.stock_hint, p.unlimited_stock, p.manual_fulfillment, p.low_stock_threshold,
                COALESCE(SUM(CASE WHEN lk.status='available' THEN 1 ELSE 0 END),0) avail
           FROM products p
           LEFT JOIN license_keys lk ON lk.product_id = p.id
          WHERE p.active = 1
          GROUP BY p.id, p.name, p.slug, p.stock_hint, p.unlimited_stock, p.manual_fulfillment, p.low_stock_threshold`,
      ),
      mysqlQuery<{
        id: string; reference_code: string; created_at: string; user_note: string | null; product_name: string | null;
      }>(
        `SELECT o.id, o.reference_code, o.created_at, o.user_note, p.name product_name
           FROM orders o LEFT JOIN products p ON p.id = o.product_id
          WHERE o.user_note IS NOT NULL AND o.status <> 'rejected'
          ORDER BY o.created_at DESC LIMIT 5`,
      ),
      mysqlQuery<{
        id: string; status: string; price_try: number; reference_code: string; created_at: string; product_name: string | null; user_id: string | null;
      }>(
        `SELECT o.id, o.status, o.price_try, o.reference_code, o.created_at, p.name product_name, o.user_id
           FROM orders o LEFT JOIN products p ON p.id = o.product_id
          WHERE NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = o.user_id AND ur.role='admin')
          ORDER BY o.created_at DESC LIMIT 6`,
      ),
      mysqlQuery<{ price_try: number; product_name: string | null }>(
        `SELECT o.price_try, p.name product_name
           FROM orders o LEFT JOIN products p ON p.id = o.product_id
          WHERE o.status = 'approved'
            AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = o.user_id AND ur.role='admin')`,
      ),
    ]);

    const lowStock = lowStockProducts
      .map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        avail: num(p.avail) ?? 0,
        unlimited: bool(p.unlimited_stock),
        manual: bool(p.manual_fulfillment),
        hint: p.stock_hint,
        threshold: num(p.low_stock_threshold) ?? 5,
      }))
      .filter((p) => !p.unlimited && !p.manual && p.avail < p.threshold)
      .sort((a, b) => a.avail - b.avail);

    const productAgg = new Map<string, { name: string; revenue: number; count: number }>();
    for (const row of topProductRows) {
      const name = row.product_name ?? "—";
      const cur = productAgg.get(name) ?? { name, revenue: 0, count: 0 };
      cur.revenue += num(row.price_try) ?? 0;
      cur.count += 1;
      productAgg.set(name, cur);
    }
    const topProducts = Array.from(productAgg.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6)
      .map((p) => ({ ...p, name: p.name.length > 18 ? p.name.slice(0, 17) + "…" : p.name }));

    return {
      totalRev: financial.total_revenue,
      todayRev: financial.today_revenue,
      totalCost: financial.total_cost,
      totalProfit: financial.total_profit,
      discountTotal: financial.discount_total,
      totalOrders: financial.approved_orders,
      pendingCount: Number(pendingRow?.c ?? 0),
      availableKeys: Number(keysRow?.c ?? 0),
      chart: financial.chart,
      lowStock,
      messages: messages.map((m) => ({
        id: m.id,
        reference_code: m.reference_code,
        created_at: m.created_at,
        user_note: m.user_note,
        product: m.product_name ? { name: m.product_name } : null,
      })),
      recent: recent.map((o) => ({
        id: o.id,
        status: o.status,
        price_try: num(o.price_try) ?? 0,
        reference_code: o.reference_code,
        created_at: o.created_at,
        product: o.product_name ? { name: o.product_name } : null,
      })),
      topProducts,
    };
  });

// ---------- cost/revenue chart (14 days, order-level, no manual entries) ----------

export const getCostRevenueChart14d = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<{
    chart: { date: string; revenue: number; cost: number; profit: number }[];
    totalRevenue: number;
    totalCost: number;
    totalProfit: number;
  }> => {
    const since = new Date();
    since.setDate(since.getDate() - 13);
    since.setHours(0, 0, 0, 0);

    const orders = await mysqlQuery<{ id: string; created_at: string; price_try: number; product_id: string | null; product_cost_try: number | null }>(
      `SELECT o.id, o.created_at, o.price_try, o.product_id, p.cost_try product_cost_try
         FROM orders o LEFT JOIN products p ON p.id = o.product_id
        WHERE o.status = 'approved' AND o.created_at >= ?`,
      [since.toISOString()],
    );
    const items = await mysqlQuery<{ order_id: string; quantity: number; product_cost_try: number | null }>(
      `SELECT oi.order_id, oi.quantity, p.cost_try product_cost_try
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         LEFT JOIN products p ON p.id = oi.product_id
        WHERE o.status = 'approved' AND o.created_at >= ?`,
      [since.toISOString()],
    );

    const itemsByOrder = new Map<string, { qty: number; cost: number }[]>();
    for (const it of items) {
      const list = itemsByOrder.get(it.order_id) ?? [];
      list.push({ qty: num(it.quantity) ?? 0, cost: num(it.product_cost_try) ?? 0 });
      itemsByOrder.set(it.order_id, list);
    }

    const days: Record<string, { date: string; revenue: number; cost: number; profit: number }> = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = d.toISOString().slice(0, 10);
      days[k] = { date: k.slice(5), revenue: 0, cost: 0, profit: 0 };
    }

    let totalRevenue = 0, totalCost = 0;
    for (const o of orders) {
      const k = new Date(o.created_at).toISOString().slice(0, 10);
      if (!(k in days)) continue;
      const revenue = num(o.price_try) ?? 0;
      let cost = 0;
      const lineItems = itemsByOrder.get(o.id);
      if (lineItems && lineItems.length > 0) {
        for (const it of lineItems) cost += it.cost * it.qty;
      } else {
        cost += num(o.product_cost_try) ?? 0;
      }
      days[k].revenue += revenue;
      days[k].cost += cost;
      days[k].profit += revenue - cost;
      totalRevenue += revenue;
      totalCost += cost;
    }

    return {
      chart: Object.values(days),
      totalRevenue,
      totalCost,
      totalProfit: totalRevenue - totalCost,
    };
  });

// ---------- profitability panel (summary + product table) ----------

export const getProfitabilityPanel = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<{
    summary: {
      today_revenue: number; today_orders: number;
      week_revenue: number; week_orders: number;
      month_revenue: number; month_orders: number;
      avg_basket: number; users_count: number;
    };
    products: { product_id: string; name: string; sold: number; revenue: number; cost: number; profit: number }[];
  }> => {
    const [summary, products] = await Promise.all([
      getDashboardSummary(),
      getProductProfitability(),
    ]);
    return { summary, products };
  });
