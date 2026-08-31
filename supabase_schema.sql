-- Run this in Supabase → SQL Editor

-- 1. Create banners table (missing entirely)
CREATE TABLE IF NOT EXISTS public.banners (
  id text NOT NULL DEFAULT gen_random_uuid()::text,
  image text NOT NULL,
  label text DEFAULT '',
  sub text DEFAULT '',
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT banners_pkey PRIMARY KEY (id)
);

-- 2. Add missing columns to raw_material_purchases
ALTER TABLE public.raw_material_purchases
  ADD COLUMN IF NOT EXISTS amount_paid numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method text;

-- 3. Add Razorpay tracking columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS gateway_order_id text,
  ADD COLUMN IF NOT EXISTS gateway_signature text;

-- 4. Store inventory quantities with decimal precision for kg/gm products
ALTER TABLE IF EXISTS public.products
  ALTER COLUMN current_stock_qty TYPE numeric USING current_stock_qty::numeric,
  ALTER COLUMN safety_low_threshold TYPE numeric USING safety_low_threshold::numeric,
  ALTER COLUMN price TYPE numeric USING price::numeric,
  ALTER COLUMN unit_purchase_cost TYPE numeric USING unit_purchase_cost::numeric;

ALTER TABLE IF EXISTS public.products
  ADD COLUMN IF NOT EXISTS show_in_mobile boolean NOT NULL DEFAULT true;

ALTER TABLE IF EXISTS public.inventory_log
  ALTER COLUMN qty TYPE numeric USING qty::numeric;
