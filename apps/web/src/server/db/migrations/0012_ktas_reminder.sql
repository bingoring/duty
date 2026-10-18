ALTER TABLE "users" ADD COLUMN "ktas_reminder_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ktas_reminded_until" date;