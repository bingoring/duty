CREATE TABLE "leave_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"proposed_by" uuid NOT NULL,
	"type" text NOT NULL,
	"reason_code" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"days" numeric(4, 1) NOT NULL,
	"comment" text,
	"status" text NOT NULL,
	"closed_reason" text,
	"leave_request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "leave_proposals" ADD CONSTRAINT "leave_proposals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_proposals" ADD CONSTRAINT "leave_proposals_proposed_by_users_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_proposals" ADD CONSTRAINT "leave_proposals_leave_request_id_leave_requests_id_fk" FOREIGN KEY ("leave_request_id") REFERENCES "public"."leave_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leave_proposals_user_status_idx" ON "leave_proposals" USING btree ("user_id","status");