CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"assigned_event_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_assigned_event_id_events_id_fk" FOREIGN KEY ("assigned_event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;