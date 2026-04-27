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
