CREATE TABLE "stock_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"note" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "stock_entries" ADD CONSTRAINT "stock_entries_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "stock";