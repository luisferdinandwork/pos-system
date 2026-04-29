ALTER TABLE "users" RENAME TO "auth_users";--> statement-breakpoint
ALTER TABLE "auth_users" RENAME COLUMN "assigned_event_id" TO "event_id";--> statement-breakpoint
ALTER TABLE "auth_users" DROP CONSTRAINT "users_username_unique";--> statement-breakpoint
ALTER TABLE "auth_users" DROP CONSTRAINT "users_assigned_event_id_events_id_fk";
--> statement-breakpoint
ALTER TABLE "auth_users" ADD CONSTRAINT "auth_users_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_users" ADD CONSTRAINT "auth_users_username_unique" UNIQUE("username");