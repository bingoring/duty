ALTER TABLE "cell_edit_logs" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "changes_seen_at" timestamp with time zone;