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
ALTER TABLE "cash_drawer_counts" ADD CONSTRAINT "cash_drawer_counts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_drawer_counts" ADD CONSTRAINT "cash_drawer_counts_cashier_session_id_cashier_sessions_id_fk" FOREIGN KEY ("cashier_session_id") REFERENCES "public"."cashier_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_receipt_templates" ADD CONSTRAINT "event_receipt_templates_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_drawer_counts_event_idx" ON "cash_drawer_counts" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "cash_drawer_counts_session_idx" ON "cash_drawer_counts" USING btree ("cashier_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_receipt_templates_event_unique" ON "event_receipt_templates" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_receipt_templates_event_idx" ON "event_receipt_templates" USING btree ("event_id");