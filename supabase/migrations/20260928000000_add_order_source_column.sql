-- Add order_source column to distinguish retail vs dealer orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_source TEXT NOT NULL DEFAULT 'retail';

-- Backfill: mark existing dealer orders based on user_note
UPDATE public.orders
   SET order_source = 'dealer'
 WHERE user_note = 'Bayi toplu alım'
   AND order_source = 'retail';

-- Also mark orders placed by known dealers
UPDATE public.orders o
   SET order_source = 'dealer'
 WHERE EXISTS (SELECT 1 FROM public.dealers d WHERE d.user_id = o.user_id)
   AND o.user_note = 'Bayi toplu alım'
   AND o.order_source = 'retail';

-- Index for fast filtering
CREATE INDEX IF NOT EXISTS idx_orders_order_source ON public.orders(order_source);
