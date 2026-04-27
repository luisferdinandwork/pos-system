ALTER TABLE "products" ADD COLUMN "base_item_no" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "variant_code" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "unit" text DEFAULT 'PCS';--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "original_price" numeric(12, 2);