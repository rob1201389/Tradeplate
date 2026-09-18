import {
  pgTable,
  serial,
  integer,
  date,
  text,
  timestamp,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * A physical trade plate. One row per plate; the QR code stuck on the back of
 * the plate points at /p/<qrSlug>, so scanning identifies the plate for us.
 */
export const plates = pgTable(
  "plates",
  {
    id: serial("id").primaryKey(),
    plateNumber: text("plate_number").notNull(),
    qrSlug: text("qr_slug").notNull(),
    /** Date the plate's registration expires. Stored as a plain date, no time. */
    expiryDate: date("expiry_date"),
    active: boolean("active").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("plates_plate_number_idx").on(t.plateNumber),
    uniqueIndex("plates_qr_slug_idx").on(t.qrSlug),
  ],
);

/**
 * One row per use of a plate. Created when the plate goes out, completed when
 * it comes back in. Rows are never deleted - this is the audit record.
 */
export const trips = pgTable(
  "trips",
  {
    id: serial("id").primaryKey(),
    plateId: integer("plate_id")
      .notNull()
      .references(() => plates.id),
    /** Snapshot of the plate number at time of use, so history survives renames. */
    plateNumber: text("plate_number").notNull(),

    batchNumber: text("batch_number").notNull(),
    vehicleMake: text("vehicle_make").notNull(),
    vehicleRego: text("vehicle_rego"),
    tripDestination: text("trip_destination").notNull(),
    purpose: text("purpose"),
    driverName: text("driver_name").notNull(),
    driverLicence: text("driver_licence"),

    outAt: timestamp("out_at", { withTimezone: true }).notNull(),
    inAt: timestamp("in_at", { withTimezone: true }),

    /** PNG data URLs captured from the on-screen signature pad. */
    signatureOut: text("signature_out"),
    signatureIn: text("signature_in"),

    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdIp: text("created_ip"),
    createdUa: text("created_ua"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedIp: text("completed_ip"),
    completedUa: text("completed_ua"),
  },
  (t) => [
    index("trips_plate_id_idx").on(t.plateId),
    index("trips_out_at_idx").on(t.outAt),
    index("trips_in_at_idx").on(t.inAt),
    // A plate can only be out once at a time, even if two phones submit at once.
    uniqueIndex("trips_one_open_per_plate_idx")
      .on(t.plateId)
      .where(sql`${t.inAt} is null`),
  ],
);

export type Plate = typeof plates.$inferSelect;
export type Trip = typeof trips.$inferSelect;
