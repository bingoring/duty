CREATE TABLE "swap_request_items" (
	"request_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"response" text NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "swap_request_items_request_id_user_id_pk" PRIMARY KEY("request_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "swap_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month_plan_id" uuid NOT NULL,
	"date" date NOT NULL,
	"requester_id" uuid NOT NULL,
	"comment" text,
	"status" text NOT NULL,
	"closed_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "swap_request_items" ADD CONSTRAINT "swap_request_items_request_id_swap_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."swap_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_request_items" ADD CONSTRAINT "swap_request_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_month_plan_id_month_plans_id_fk" FOREIGN KEY ("month_plan_id") REFERENCES "public"."month_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "swap_items_user_idx" ON "swap_request_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "swap_requests_plan_idx" ON "swap_requests" USING btree ("month_plan_id","status");