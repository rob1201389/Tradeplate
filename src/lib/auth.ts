import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "tp_admin";
const MAX_AGE_SECONDS = 60 * 60 * 12;
const DRIVER_COOKIE = "tp_driver";
const DRIVER_MAX_AGE_SECONDS = 60 * 60 * 24 * 60;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "SESSION_SECRET is not set (needs 16+ characters). See .env.example.",
    );
  }
  return s;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function checkPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    throw new Error("ADMIN_PASSWORD is not set. See .env.example.");
  }
  return safeEqual(input, expected);
}

export async function createSession() {
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = String(expires);
  const value = `${payload}.${sign(payload)}`;
  const jar = await cookies();
  jar.set(COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function isAuthed(): Promise<boolean> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return false;
  const [payload, mac] = raw.split(".");
  if (!payload || !mac) return false;
  if (!safeEqual(mac, sign(payload))) return false;
  return Number(payload) > Date.now();
}

/**
 * Optional shared PIN on the driver-facing forms. Left unset, anyone holding a
 * plate's QR link can write a record; set, a phone is asked once every 60 days.
 */
export function driverPinRequired(): boolean {
  return Boolean(process.env.DRIVER_PIN);
}

export function checkDriverPin(input: string): boolean {
  const expected = process.env.DRIVER_PIN;
  if (!expected) return true;
  return safeEqual(input, expected);
}

export async function createDriverSession() {
  const expires = Date.now() + DRIVER_MAX_AGE_SECONDS * 1000;
  const payload = String(expires);
  const jar = await cookies();
  jar.set(DRIVER_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DRIVER_MAX_AGE_SECONDS,
  });
}

export async function isDriverAuthed(): Promise<boolean> {
  if (!driverPinRequired()) return true;
  const jar = await cookies();
  const raw = jar.get(DRIVER_COOKIE)?.value;
  if (!raw) return false;
  const [payload, mac] = raw.split(".");
  if (!payload || !mac) return false;
  if (!safeEqual(mac, sign(payload))) return false;
  return Number(payload) > Date.now();
}

/** Unguessable slug encoded in the QR code printed on the plate. */
export function newQrSlug(): string {
  return randomBytes(9).toString("base64url");
}
