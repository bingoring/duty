CREATE TABLE "balance_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"account" text NOT NULL,
	"delta" numeric(6, 1) NOT NULL,
	"reason" text NOT NULL,
	"ref_year" integer,
	"ref_month" integer,
	"ref_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "candidate_cells" (
	"candidate_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"code" text NOT NULL,
	"off_kind" text,
	"leave_kind" text,
	"checkup_half" boolean DEFAULT false NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "candidate_cells_candidate_id_user_id_date_pk" PRIMARY KEY("candidate_id","user_id","date")
);
--> statement-breakpoint
CREATE TABLE "cell_edit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month_plan_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"edited_by" uuid NOT NULL,
	"edited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"password_changed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"created_by" uuid,
	CONSTRAINT "holidays_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"reason_code" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"days" numeric(4, 1) NOT NULL,
	"attachment_id" uuid,
	"status" text NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"reject_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "month_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ward_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"status" text NOT NULL,
	"request_deadline" date NOT NULL,
	"negotiation_start" date NOT NULL,
	"negotiation_end" date NOT NULL,
	"rule_version" integer,
	"confirmed_candidate_id" uuid,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	"closed_by" uuid,
	"closed_at" timestamp with time zone,
	CONSTRAINT "month_plans_ward_ym_uq" UNIQUE("ward_id","year","month")
);
--> statement-breakpoint
CREATE TABLE "month_settlements" (
	"month_plan_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"baseline_off" integer NOT NULL,
	"actual_off" integer NOT NULL,
	"sleeping_off" integer NOT NULL,
	"night_count" integer NOT NULL,
	"off_carry_before" numeric(6, 1) NOT NULL,
	"off_carry_after" numeric(6, 1) NOT NULL,
	"night_bank_before" integer NOT NULL,
	"night_bank_after" integer NOT NULL,
	"weekend_pair_achieved" boolean NOT NULL,
	"special_used" numeric(4, 1) NOT NULL,
	"founding_used" numeric(4, 1) NOT NULL,
	"checkup_used" numeric(4, 1) NOT NULL,
	"edu_cont" integer NOT NULL,
	CONSTRAINT "month_settlements_month_plan_id_user_id_pk" PRIMARY KEY("month_plan_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "rule_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ward_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"params" jsonb NOT NULL,
	"toggles" jsonb NOT NULL,
	"forbidden_patterns" jsonb NOT NULL,
	"diff" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rule_versions_ward_version_uq" UNIQUE("ward_id","version")
);
--> statement-breakpoint
CREATE TABLE "schedule_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month_plan_id" uuid NOT NULL,
	"generation_no" integer NOT NULL,
	"seed" integer NOT NULL,
	"rule_version" integer NOT NULL,
	"check_result" jsonb NOT NULL,
	"solver_meta" jsonb,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_candidates_plan_gen_uq" UNIQUE("month_plan_id","generation_no")
);
--> statement-breakpoint
CREATE TABLE "schedule_cells" (
	"month_plan_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"code" text NOT NULL,
	"off_kind" text,
	"leave_kind" text,
	"checkup_half" boolean DEFAULT false NOT NULL,
	"source" text NOT NULL,
	"edited_by" uuid,
	"edited_at" timestamp with time zone,
	CONSTRAINT "schedule_cells_month_plan_id_user_id_date_pk" PRIMARY KEY("month_plan_id","user_id","date")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"persistent" boolean NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "shift_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"date" date NOT NULL,
	"options" text[] DEFAULT '{}'::text[] NOT NULL,
	"special" text,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shift_requests_user_date_uq" UNIQUE("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "trainings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainee_id" uuid NOT NULL,
	"preceptor_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"triple_staff_until" date NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ward_id" uuid NOT NULL,
	"employee_no" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'nurse' NOT NULL,
	"rotation" text DEFAULT 'rotating' NOT NULL,
	"seniority_rank" integer NOT NULL,
	"seniority_tier" text NOT NULL,
	"hire_date" date,
	"k_tass" boolean DEFAULT false NOT NULL,
	"union_member" boolean DEFAULT false NOT NULL,
	"night_dedicated_from" date,
	"night_dedicated_to" date,
	"active" boolean DEFAULT true NOT NULL,
	"deactivated_at" timestamp with time zone,
	"onboarded_year" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_employee_no_unique" UNIQUE("employee_no")
);
--> statement-breakpoint
CREATE TABLE "wards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "wards_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "balance_entries" ADD CONSTRAINT "balance_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_entries" ADD CONSTRAINT "balance_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_cells" ADD CONSTRAINT "candidate_cells_candidate_id_schedule_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."schedule_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_cells" ADD CONSTRAINT "candidate_cells_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cell_edit_logs" ADD CONSTRAINT "cell_edit_logs_month_plan_id_month_plans_id_fk" FOREIGN KEY ("month_plan_id") REFERENCES "public"."month_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cell_edit_logs" ADD CONSTRAINT "cell_edit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cell_edit_logs" ADD CONSTRAINT "cell_edit_logs_edited_by_users_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month_plans" ADD CONSTRAINT "month_plans_ward_id_wards_id_fk" FOREIGN KEY ("ward_id") REFERENCES "public"."wards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month_plans" ADD CONSTRAINT "month_plans_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month_plans" ADD CONSTRAINT "month_plans_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month_settlements" ADD CONSTRAINT "month_settlements_month_plan_id_month_plans_id_fk" FOREIGN KEY ("month_plan_id") REFERENCES "public"."month_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month_settlements" ADD CONSTRAINT "month_settlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_versions" ADD CONSTRAINT "rule_versions_ward_id_wards_id_fk" FOREIGN KEY ("ward_id") REFERENCES "public"."wards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_versions" ADD CONSTRAINT "rule_versions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_candidates" ADD CONSTRAINT "schedule_candidates_month_plan_id_month_plans_id_fk" FOREIGN KEY ("month_plan_id") REFERENCES "public"."month_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_candidates" ADD CONSTRAINT "schedule_candidates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_cells" ADD CONSTRAINT "schedule_cells_month_plan_id_month_plans_id_fk" FOREIGN KEY ("month_plan_id") REFERENCES "public"."month_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_cells" ADD CONSTRAINT "schedule_cells_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_cells" ADD CONSTRAINT "schedule_cells_edited_by_users_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_requests" ADD CONSTRAINT "shift_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainings" ADD CONSTRAINT "trainings_trainee_id_users_id_fk" FOREIGN KEY ("trainee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainings" ADD CONSTRAINT "trainings_preceptor_id_users_id_fk" FOREIGN KEY ("preceptor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainings" ADD CONSTRAINT "trainings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_ward_id_wards_id_fk" FOREIGN KEY ("ward_id") REFERENCES "public"."wards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "balance_entries_user_account_idx" ON "balance_entries" USING btree ("user_id","account");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shift_requests_ym_idx" ON "shift_requests" USING btree ("year","month");