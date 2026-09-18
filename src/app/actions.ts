"use server";

import { and, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { sydneyWallToDate, expiryStatus } from "@/lib/time";
import { str, required, signature, type FieldErrors } from "@/lib/validation";
import {
  checkDriverPin,
  checkPassword,
  createDriverSession,
  createSession,
  destroySession,
  isAuthed,
  isDriverAuthed,
  newQrSlug,
} from "@/lib/auth";

export type ActionState = { errors: FieldErrors; message?: string } | null;

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "23505"
  );
}

async function requestMeta() {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    null;
  return { ip, ua: h.get("user-agent")?.slice(0, 300) ?? null };
}

/** Records a plate going out. */
export async function startTrip(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  if (!(await isDriverAuthed()))
    return { errors: {}, message: "Session expired. Reload the page." };

  const db = getDb();
  const errors: FieldErrors = {};

  const plateNumber = str(form, "plateNumber");
  if (!plateNumber) return { errors: {}, message: "No plate selected." };

  const [plate] = await db
    .select()
    .from(schema.plates)
    .where(eq(schema.plates.plateNumber, plateNumber))
    .limit(1);

  if (!plate) return { errors: {}, message: "That plate is not on file." };
  if (!plate.active)
    return { errors: {}, message: `Plate ${plate.plateNumber} is retired.` };

  const expiry = expiryStatus(plate.expiryDate);
  if (expiry.state === "expired") {
    return {
      errors: {},
      message: `Plate ${plate.plateNumber} expired on ${plate.expiryDate
        ?.split("-")
        .reverse()
        .join("/")}. It cannot be signed out. See the office.`,
    };
  }

  const [open] = await db
    .select({ id: schema.trips.id })
    .from(schema.trips)
    .where(and(eq(schema.trips.plateId, plate.id), isNull(schema.trips.inAt)))
    .limit(1);

  if (open) {
    return {
      errors: {},
      message: `Plate ${plate.plateNumber} is already signed out. Scan it again to book it back in.`,
    };
  }

  const outAtRaw = str(form, "outAt");
  const outAt = sydneyWallToDate(outAtRaw);
  if (!outAt) errors.outAt = "Enter a valid date and time";

  const batchNumber = required(
    errors,
    "batchNumber",
    str(form, "batchNumber"),
    "Batch number",
    50,
  );
  const vehicleMake = required(
    errors,
    "vehicleMake",
    str(form, "vehicleMake"),
    "Vehicle make",
    80,
  );
  const tripDestination = required(
    errors,
    "tripDestination",
    str(form, "tripDestination"),
    "Trip destination",
    200,
  );
  const driverName = required(
    errors,
    "driverName",
    str(form, "driverName"),
    "Driver's name",
    120,
  );

  const signatureOut = signature(str(form, "signatureOut"));
  if (!signatureOut) errors.signatureOut = "Signature is required";

  if (Object.keys(errors).length > 0) {
    return { errors, message: "Check the highlighted fields." };
  }

  const meta = await requestMeta();

  try {
    await db.insert(schema.trips).values({
      plateId: plate.id,
      plateNumber: plate.plateNumber,
      batchNumber,
      vehicleMake,
      vehicleRego: str(form, "vehicleRego").toUpperCase() || null,
      tripDestination,
      purpose: str(form, "purpose") || null,
      driverName,
      driverLicence: str(form, "driverLicence") || null,
      outAt: outAt!,
      signatureOut,
      notes: str(form, "notes") || null,
      createdIp: meta.ip,
      createdUa: meta.ua,
    });
  } catch (err) {
    // The partial unique index catches two phones signing the same plate out
    // at the same moment.
    if (isUniqueViolation(err)) {
      return {
        errors: {},
        message: `Plate ${plate.plateNumber} was just signed out by someone else. Reload this page.`,
      };
    }
    throw err;
  }

  revalidatePath("/admin");
  redirect(`/p/${plate.qrSlug}?saved=out`);
}

/** Books a plate back in and closes the record. */
export async function completeTrip(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  if (!(await isDriverAuthed()))
    return { errors: {}, message: "Session expired. Reload the page." };

  const db = getDb();
  const errors: FieldErrors = {};

  const tripId = Number(str(form, "tripId"));
  if (!Number.isInteger(tripId) || tripId <= 0)
    return { errors: {}, message: "Record not found." };

  const [trip] = await db
    .select()
    .from(schema.trips)
    .where(eq(schema.trips.id, tripId))
    .limit(1);

  if (!trip) return { errors: {}, message: "Record not found." };
  if (trip.inAt)
    return { errors: {}, message: "That record is already closed off." };

  const inAt = sydneyWallToDate(str(form, "inAt"));
  if (!inAt) errors.inAt = "Enter a valid date and time";
  else if (inAt.getTime() < trip.outAt.getTime())
    errors.inAt = "Time in cannot be before time out";

  const signatureIn = signature(str(form, "signatureIn"));
  if (!signatureIn) errors.signatureIn = "Signature is required";

  if (Object.keys(errors).length > 0) {
    return { errors, message: "Check the highlighted fields." };
  }

  const meta = await requestMeta();
  const extraNotes = str(form, "notes");

  await db
    .update(schema.trips)
    .set({
      inAt: inAt!,
      signatureIn,
      notes: extraNotes
        ? [trip.notes, extraNotes].filter(Boolean).join(" | ")
        : trip.notes,
      completedAt: new Date(),
      completedIp: meta.ip,
      completedUa: meta.ua,
    })
    .where(and(eq(schema.trips.id, tripId), isNull(schema.trips.inAt)));

  const [plate] = await db
    .select({ qrSlug: schema.plates.qrSlug })
    .from(schema.plates)
    .where(eq(schema.plates.id, trip.plateId))
    .limit(1);

  revalidatePath("/admin");
  redirect(`/p/${plate?.qrSlug ?? ""}?saved=in`);
}

export async function unlockDriver(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const pin = str(form, "pin");
  if (!pin) return { errors: { pin: "Enter the PIN" } };
  if (!checkDriverPin(pin)) return { errors: {}, message: "Wrong PIN." };
  await createDriverSession();
  // Only ever a path on this site, never an arbitrary URL.
  const next = str(form, "next");
  redirect(/^\/[A-Za-z0-9/_-]*$/.test(next) ? next : "/");
}

export async function login(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const password = str(form, "password");
  if (!password) return { errors: { password: "Enter the password" } };
  if (!checkPassword(password))
    return { errors: {}, message: "Wrong password." };
  await createSession();
  redirect("/admin");
}

export async function logout() {
  await destroySession();
  redirect("/admin/login");
}

export async function addPlate(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  if (!(await isAuthed())) redirect("/admin/login");
  const db = getDb();
  const errors: FieldErrors = {};
  const plateNumber = required(
    errors,
    "plateNumber",
    str(form, "plateNumber").toUpperCase(),
    "Plate number",
    30,
  );
  const expiryDate = str(form, "expiryDate");
  if (expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate))
    errors.expiryDate = "Enter a valid date";

  if (Object.keys(errors).length > 0) return { errors };

  const [existing] = await db
    .select({ id: schema.plates.id })
    .from(schema.plates)
    .where(eq(schema.plates.plateNumber, plateNumber))
    .limit(1);
  if (existing)
    return { errors: { plateNumber: "That plate is already on file" } };

  await db.insert(schema.plates).values({
    plateNumber,
    qrSlug: newQrSlug(),
    expiryDate: expiryDate || null,
    notes: str(form, "notes") || null,
  });

  revalidatePath("/admin/plates");
  return { errors: {}, message: `Plate ${plateNumber} added.` };
}

export async function setPlateExpiry(form: FormData) {
  if (!(await isAuthed())) redirect("/admin/login");
  const db = getDb();
  const id = Number(str(form, "id"));
  const value = str(form, "expiryDate");
  if (!Number.isInteger(id)) return;
  if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
  await db
    .update(schema.plates)
    .set({ expiryDate: value || null })
    .where(eq(schema.plates.id, id));
  revalidatePath("/admin/plates");
  revalidatePath("/");
}

export async function setPlateActive(form: FormData) {
  if (!(await isAuthed())) redirect("/admin/login");
  const db = getDb();
  const id = Number(str(form, "id"));
  const active = str(form, "active") === "true";
  if (!Number.isInteger(id)) return;
  await db
    .update(schema.plates)
    .set({ active })
    .where(eq(schema.plates.id, id));
  revalidatePath("/admin/plates");
}
