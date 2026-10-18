CREATE TABLE "doctor_candidate_shifts" (
	"candidate_id" uuid NOT NULL,
	"date" date NOT NULL,
	"day_user" uuid NOT NULL,
	"night_user" uuid NOT NULL,
	CONSTRAINT "doctor_candidate_shifts_candidate_id_date_pk" PRIMARY KEY("candidate_id","date")
);
--> statement-breakpoint
CREATE TABLE "doctor_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"generation_no" integer NOT NULL,
	"seed" integer NOT NULL,
	"rule_version" integer NOT NULL,
	"check_result" jsonb NOT NULL,
	"solver_meta" jsonb,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doctor_candidates_plan_gen_uq" UNIQUE("plan_id","generation_no")
);
--> statement-breakpoint
CREATE TABLE "doctor_month_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"status" text NOT NULL,
	"request_deadline" date NOT NULL,
	"negotiation_end" date NOT NULL,
	"extras" jsonb DEFAULT '{"D":[],"N":[]}'::jsonb NOT NULL,
	"rule_version" integer,
	"confirmed_candidate_id" uuid,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doctor_month_plans_ym_uq" UNIQUE("year","month")
);
--> statement-breakpoint
CREATE TABLE "doctor_prefs" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"all_day_min" integer,
	"all_day_max" integer,
	"fixed_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doctor_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"date" date NOT NULL,
	"options" text[] DEFAULT '{}'::text[] NOT NULL,
	"comment" text,
	"fixed_exception" boolean DEFAULT false NOT NULL,
	"by_admin" boolean DEFAULT false NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doctor_requests_user_date_uq" UNIQUE("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "doctor_rule_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"params" jsonb NOT NULL,
	"diff" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doctor_rule_versions_version_unique" UNIQUE("version")
);
--> statement-breakpoint
CREATE TABLE "doctor_shift_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"date" date NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"edited_by" uuid NOT NULL,
	"edited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "doctor_shifts" (
	"plan_id" uuid NOT NULL,
	"date" date NOT NULL,
	"day_user" uuid NOT NULL,
	"night_user" uuid NOT NULL,
	"source" text NOT NULL,
	"edited_by" uuid,
	"edited_at" timestamp with time zone,
	CONSTRAINT "doctor_shifts_plan_id_date_pk" PRIMARY KEY("plan_id","date")
);
--> statement-breakpoint
CREATE TABLE "doctor_swap_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"requester_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"chip_a" jsonb NOT NULL,
	"chip_b" jsonb NOT NULL,
	"comment" text,
	"status" text NOT NULL,
	"closed_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "login_id_kind" text DEFAULT 'employee_no' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role_group" text DEFAULT 'nurse' NOT NULL;--> statement-breakpoint
ALTER TABLE "doctor_candidate_shifts" ADD CONSTRAINT "doctor_candidate_shifts_candidate_id_doctor_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."doctor_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_candidate_shifts" ADD CONSTRAINT "doctor_candidate_shifts_day_user_users_id_fk" FOREIGN KEY ("day_user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_candidate_shifts" ADD CONSTRAINT "doctor_candidate_shifts_night_user_users_id_fk" FOREIGN KEY ("night_user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_candidates" ADD CONSTRAINT "doctor_candidates_plan_id_doctor_month_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."doctor_month_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_candidates" ADD CONSTRAINT "doctor_candidates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_month_plans" ADD CONSTRAINT "doctor_month_plans_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_prefs" ADD CONSTRAINT "doctor_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_requests" ADD CONSTRAINT "doctor_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_rule_versions" ADD CONSTRAINT "doctor_rule_versions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_shift_logs" ADD CONSTRAINT "doctor_shift_logs_plan_id_doctor_month_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."doctor_month_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_shift_logs" ADD CONSTRAINT "doctor_shift_logs_edited_by_users_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_shifts" ADD CONSTRAINT "doctor_shifts_plan_id_doctor_month_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."doctor_month_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_shifts" ADD CONSTRAINT "doctor_shifts_day_user_users_id_fk" FOREIGN KEY ("day_user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_shifts" ADD CONSTRAINT "doctor_shifts_night_user_users_id_fk" FOREIGN KEY ("night_user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_shifts" ADD CONSTRAINT "doctor_shifts_edited_by_users_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_swap_requests" ADD CONSTRAINT "doctor_swap_requests_plan_id_doctor_month_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."doctor_month_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_swap_requests" ADD CONSTRAINT "doctor_swap_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_swap_requests" ADD CONSTRAINT "doctor_swap_requests_target_id_users_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "doctor_requests_ym_idx" ON "doctor_requests" USING btree ("year","month");--> statement-breakpoint
CREATE INDEX "doctor_swaps_plan_idx" ON "doctor_swap_requests" USING btree ("plan_id","status");--> statement-breakpoint
CREATE INDEX "doctor_swaps_target_idx" ON "doctor_swap_requests" USING btree ("target_id","status");