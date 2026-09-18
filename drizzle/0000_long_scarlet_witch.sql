CREATE TABLE IF NOT EXISTS "plates" (
	"id" serial PRIMARY KEY NOT NULL,
	"plate_number" text NOT NULL,
	"qr_slug" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trips" (
	"id" serial PRIMARY KEY NOT NULL,
	"plate_id" integer NOT NULL,
	"plate_number" text NOT NULL,
	"batch_number" text NOT NULL,
	"vehicle_make" text NOT NULL,
	"vehicle_rego" text,
	"trip_destination" text NOT NULL,
	"purpose" text,
	"driver_name" text NOT NULL,
	"driver_licence" text,
	"out_at" timestamp with time zone NOT NULL,
	"in_at" timestamp with time zone,
	"signature_out" text,
	"signature_in" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_ip" text,
	"created_ua" text,
	"completed_at" timestamp with time zone,
	"completed_ip" text,
	"completed_ua" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trips" ADD CONSTRAINT "trips_plate_id_plates_id_fk" FOREIGN KEY ("plate_id") REFERENCES "public"."plates"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "plates_plate_number_idx" ON "plates" USING btree ("plate_number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "plates_qr_slug_idx" ON "plates" USING btree ("qr_slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trips_plate_id_idx" ON "trips" USING btree ("plate_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trips_out_at_idx" ON "trips" USING btree ("out_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trips_in_at_idx" ON "trips" USING btree ("in_at");