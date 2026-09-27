ALTER TABLE "leave_requests" ADD COLUMN "comment" text;--> statement-breakpoint
ALTER TABLE "shift_requests" ADD COLUMN "submitted_at" timestamp with time zone;