CREATE TABLE "event_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"item_id" text NOT NULL,
	"base_item_no" text,
	"name" text NOT NULL,
	"color" text,
	"variant_code" text,
	"unit" text DEFAULT 'PCS',
	"retail_price" numeric(12, 2) NOT NULL,
	"net_price" numeric(12, 2) NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"location" text,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"start_date" timestamp,
	"end_date" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"provider" text,
	"account_info" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"transaction_id" integer NOT NULL,
	"method" text NOT NULL,
	"reference" text,
	"paid_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "promo_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"promo_id" integer NOT NULL,
	"event_item_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promo_tiers" (
	"id" serial PRIMARY KEY NOT NULL,
	"promo_id" integer NOT NULL,
	"min_qty" integer NOT NULL,
	"discount_pct" numeric(5, 2),
	"discount_fix" numeric(12, 2),
	"fixed_price" numeric(12, 2)
);
--> statement-breakpoint
CREATE TABLE "promos" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"apply_to_all" boolean DEFAULT false NOT NULL,
	"discount_pct" numeric(5, 2),
	"discount_fix" numeric(12, 2),
	"fixed_price" numeric(12, 2),
	"buy_qty" integer,
	"get_free_qty" integer,
	"free_item_id" integer,
	"spend_min_amount" numeric(12, 2),
	"free_item_product_id" integer,
	"bundle_price" numeric(12, 2),
	"flash_start_time" timestamp,
	"flash_end_time" timestamp,
	"min_purchase_qty" integer DEFAULT 1,
	"min_purchase_amt" numeric(12, 2),
	"max_usage_count" integer,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stock_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_item_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"note" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "transaction_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"transaction_id" integer NOT NULL,
	"event_item_id" integer NOT NULL,
	"product_name" text NOT NULL,
	"item_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"discount_amt" numeric(12, 2) DEFAULT '0' NOT NULL,
	"final_price" numeric(12, 2) NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL,
	"promo_applied" text
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"discount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"final_amount" numeric(12, 2) NOT NULL,
	"payment_method" text,
	"payment_reference" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "event_items" ADD CONSTRAINT "event_items_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_items" ADD CONSTRAINT "promo_items_promo_id_promos_id_fk" FOREIGN KEY ("promo_id") REFERENCES "public"."promos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_items" ADD CONSTRAINT "promo_items_event_item_id_event_items_id_fk" FOREIGN KEY ("event_item_id") REFERENCES "public"."event_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_tiers" ADD CONSTRAINT "promo_tiers_promo_id_promos_id_fk" FOREIGN KEY ("promo_id") REFERENCES "public"."promos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promos" ADD CONSTRAINT "promos_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promos" ADD CONSTRAINT "promos_free_item_id_event_items_id_fk" FOREIGN KEY ("free_item_id") REFERENCES "public"."event_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promos" ADD CONSTRAINT "promos_free_item_product_id_event_items_id_fk" FOREIGN KEY ("free_item_product_id") REFERENCES "public"."event_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_entries" ADD CONSTRAINT "stock_entries_event_item_id_event_items_id_fk" FOREIGN KEY ("event_item_id") REFERENCES "public"."event_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_event_item_id_event_items_id_fk" FOREIGN KEY ("event_item_id") REFERENCES "public"."event_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;