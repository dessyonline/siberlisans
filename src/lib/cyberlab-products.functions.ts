import { createServerFn } from "@tanstack/react-start";
import { mysqlQuery, num } from "@/lib/mysql.server";

export type CyberlabProduct = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  duration: string | null;
  price_try: number;
  image_url: string | null;
  grants_app_days: number | null;
};

export const listCyberlabProducts = createServerFn({ method: "GET" }).handler(
  async (): Promise<CyberlabProduct[]> => {
    const rows = await mysqlQuery<{
      id: string;
      name: string;
      slug: string;
      description: string | null;
      duration: string | null;
      price_try: string | number | null;
      image_url: string | null;
      grants_app_days: number | null;
    }>(
      `SELECT id, name, slug, description, duration, price_try, image_url, grants_app_days
         FROM products WHERE active=1 AND grants_app='cyberlab' ORDER BY price_try`,
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      duration: r.duration,
      price_try: num(r.price_try) ?? 0,
      image_url: r.image_url,
      grants_app_days: r.grants_app_days,
    }));
  },
);
