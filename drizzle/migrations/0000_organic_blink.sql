CREATE TABLE "auth_user_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"event_id" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "auth_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"event_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "auth_users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "cash_drawer_counts" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"cashier_session_id" integer,
	"counted_by" text,
	"expected_cash" numeric(12, 2) DEFAULT '0' NOT NULL,
	"actual_cash" numeric(12, 2) DEFAULT '0' NOT NULL,
	"difference" numeric(12, 2) DEFAULT '0' NOT NULL,
	"reason" text DEFAULT 'count' NOT NULL,
	"notes" text,
	"counted_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cashier_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"cashier_name" text NOT NULL,
	"opening_cash" numeric(12, 2) DEFAULT '0' NOT NULL,
	"closing_cash" numeric(12, 2),
	"opened_at" timestamp DEFAULT now(),
	"closed_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "edc_machines" (
	"id" serial PRIMARY KEY NOT NULL,
	"bank_name" text NOT NULL,
	"terminal_id" text,
	"label" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
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
CREATE TABLE "event_receipt_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"store_name" text,
	"headline" text,
	"address" text,
	"phone" text,
	"instagram" text,
	"tax_id" text,
	"logo_url" text,
	"footer_text" text,
	"return_policy" text,
	"promo_message" text,
	"show_event_name" boolean DEFAULT true NOT NULL,
	"show_cashier_name" boolean DEFAULT true NOT NULL,
	"show_item_sku" boolean DEFAULT true NOT NULL,
	"show_payment_reference" boolean DEFAULT true NOT NULL,
	"show_discount_breakdown" boolean DEFAULT true NOT NULL,
	"custom_css" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"verifier_code" text NOT NULL,
	"name" text NOT NULL,
	"location" text,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"start_date" timestamp,
	"end_date" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"edc_method" text,
	"edc_machine_id" integer,
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
CREATE TABLE "receipt_print_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"transaction_id" integer NOT NULL,
	"print_type" text DEFAULT 'reprint' NOT NULL,
	"printed_at" timestamp DEFAULT now(),
	"printed_by" text
);
--> statement-breakpoint
CREATE TABLE "stock_transaction_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"default_direction" integer DEFAULT 0 NOT NULL,
	"is_system" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stock_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_item_id" integer NOT NULL,
	"type_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"stock_before" integer NOT NULL,
	"stock_after" integer NOT NULL,
	"transaction_id" integer,
	"reference_type" text,
	"reference_id" text,
	"note" text,
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
	"display_id" text NOT NULL,
	"event_id" integer NOT NULL,
	"client_txn_id" text,
	"cashier_session_id" integer,
	"cashier_name" text,
	"total_amount" numeric(12, 2) NOT NULL,
	"discount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"final_amount" numeric(12, 2) NOT NULL,
	"cash_tendered" numeric(12, 2),
	"change_amount" numeric(12, 2),
	"payment_method" text,
	"payment_reference" text,
	"receipt_print_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"voided_at" timestamp,
	"voided_by" text,
	"void_reason" text,
	"void_of_transaction_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "transactions_client_txn_id_unique" UNIQUE("client_txn_id")
);
--> statement-breakpoint
ALTER TABLE "auth_user_events" ADD CONSTRAINT "auth_user_events_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_user_events" ADD CONSTRAINT "auth_user_events_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_users" ADD CONSTRAINT "auth_users_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_drawer_counts" ADD CONSTRAINT "cash_drawer_counts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_drawer_counts" ADD CONSTRAINT "cash_drawer_counts_cashier_session_id_cashier_sessions_id_fk" FOREIGN KEY ("cashier_session_id") REFERENCES "public"."cashier_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashier_sessions" ADD CONSTRAINT "cashier_sessions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_items" ADD CONSTRAINT "event_items_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_receipt_templates" ADD CONSTRAINT "event_receipt_templates_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_edc_machine_id_edc_machines_id_fk" FOREIGN KEY ("edc_machine_id") REFERENCES "public"."edc_machines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_items" ADD CONSTRAINT "promo_items_promo_id_promos_id_fk" FOREIGN KEY ("promo_id") REFERENCES "public"."promos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_items" ADD CONSTRAINT "promo_items_event_item_id_event_items_id_fk" FOREIGN KEY ("event_item_id") REFERENCES "public"."event_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_tiers" ADD CONSTRAINT "promo_tiers_promo_id_promos_id_fk" FOREIGN KEY ("promo_id") REFERENCES "public"."promos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promos" ADD CONSTRAINT "promos_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promos" ADD CONSTRAINT "promos_free_item_id_event_items_id_fk" FOREIGN KEY ("free_item_id") REFERENCES "public"."event_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promos" ADD CONSTRAINT "promos_free_item_product_id_event_items_id_fk" FOREIGN KEY ("free_item_product_id") REFERENCES "public"."event_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_print_logs" ADD CONSTRAINT "receipt_print_logs_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_event_item_id_event_items_id_fk" FOREIGN KEY ("event_item_id") REFERENCES "public"."event_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_type_id_stock_transaction_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."stock_transaction_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_event_item_id_event_items_id_fk" FOREIGN KEY ("event_item_id") REFERENCES "public"."event_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_cashier_session_id_cashier_sessions_id_fk" FOREIGN KEY ("cashier_session_id") REFERENCES "public"."cashier_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_void_of_transaction_id_transactions_id_fk" FOREIGN KEY ("void_of_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_user_events_user_event_unique" ON "auth_user_events" USING btree ("user_id","event_id");--> statement-breakpoint
CREATE INDEX "auth_user_events_user_idx" ON "auth_user_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_user_events_event_idx" ON "auth_user_events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "cash_drawer_counts_event_idx" ON "cash_drawer_counts" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "cash_drawer_counts_session_idx" ON "cash_drawer_counts" USING btree ("cashier_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_receipt_templates_event_unique" ON "event_receipt_templates" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_receipt_templates_event_idx" ON "event_receipt_templates" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "events_code_unique" ON "events" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "events_verifier_code_unique" ON "events" USING btree ("verifier_code");--> statement-breakpoint
CREATE INDEX "events_status_idx" ON "events" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_transaction_types_code_unique" ON "stock_transaction_types" USING btree ("code");--> statement-breakpoint
CREATE INDEX "stock_transactions_event_item_idx" ON "stock_transactions" USING btree ("event_item_id");--> statement-breakpoint
CREATE INDEX "stock_transactions_type_idx" ON "stock_transactions" USING btree ("type_id");--> statement-breakpoint
CREATE INDEX "stock_transactions_transaction_idx" ON "stock_transactions" USING btree ("transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_display_id_unique" ON "transactions" USING btree ("display_id");--> statement-breakpoint
CREATE INDEX "transactions_event_idx" ON "transactions" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "transactions_created_at_idx" ON "transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "transactions_void_of_idx" ON "transactions" USING btree ("void_of_transaction_id");