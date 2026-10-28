import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const COOKIE_NAME = "raone_session";
export const SESSION_SECONDS = 30 * 24 * 60 * 60;
const equal = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
export function verifyCode(code: string) {
  return Boolean(process.env.RAONE_ACCESS_CODE) && equal(code, process.env.RAONE_ACCESS_CODE!);
}
function signature(value: string) {
  const secret = process.env.RAONE_ACCESS_CODE;
  if (!secret) return "";
  return createHmac("sha256", secret).update(`raone-session-v1:${value}`).digest("base64url");
}
export function createSession(now = Date.now()) {
  const expires = String(Math.floor(now / 1000) + SESSION_SECONDS);
  return `${expires}.${signature(expires)}`;
}
export function hasSession(request: NextRequest, now = Date.now()) {
  if (!process.env.RAONE_ACCESS_CODE) return false;
  const cookie = request.cookies.get(COOKIE_NAME)?.value || "";
  const [expires, signed, extra] = cookie.split(".");
  if (extra || !expires || !signed || !/^\d+$/.test(expires)) return false;
  const remaining = Number(expires) - Math.floor(now / 1000);
  return remaining > 0 && remaining <= SESSION_SECONDS && equal(signed, signature(expires));
}
export function sameOrigin(request: NextRequest) {
  return request.headers.get("origin") === new URL(request.url).origin;
}
