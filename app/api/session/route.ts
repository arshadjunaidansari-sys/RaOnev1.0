import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, SESSION_SECONDS, createSession, hasSession, sameOrigin, verifyCode } from "@/lib/auth";
export const runtime = "nodejs";
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(request: NextRequest) {
  return reply({ authenticated: hasSession(request) });
}
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return reply({ error: "Request not allowed." }, 403);
  if (!process.env.RAONE_ACCESS_CODE) return reply({ error: "RAONE_ACCESS_CODE is missing in Vercel." }, 503);
  try {
    const raw = await request.text();
    if (raw.length > 1000) return reply({ error: "Invalid access code." }, 400);
    const body = JSON.parse(raw);
    if (typeof body?.code !== "string" || !verifyCode(body.code)) return reply({ error: "Incorrect access code. Please try again." }, 401);
    const response = reply({ authenticated: true });
    response.cookies.set(COOKIE_NAME, createSession(), { httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "strict", path: "/", maxAge: SESSION_SECONDS });
    return response;
  } catch { return reply({ error: "Enter your access code." }, 400); }
}
export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return reply({ error: "Request not allowed." }, 403);
  const response = reply({ authenticated: false });
  response.cookies.set(COOKIE_NAME, "", { httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}
