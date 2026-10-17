ALTER TABLE "users" ADD COLUMN "ktas_renewed_on" date;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "weekend_pair_wanted" boolean DEFAULT true NOT NULL;