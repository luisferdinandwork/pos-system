CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"transaction_id" integer NOT NULL,
	"method" text NOT NULL,
	"reference" text,
	"paid_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"name" text NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "products_item_id_unique" UNIQUE("item_id")
);
--> statement-breakpoint
CREATE TABLE "transaction_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"transaction_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"product_name" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;