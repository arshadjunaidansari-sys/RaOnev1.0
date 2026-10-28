import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { hasSession, sameOrigin } from "@/lib/auth";
import { LIVE_CONFIG } from "@/lib/live-config";
export const runtime = "nodejs";
export const maxDuration = 30;
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return reply({ error: "Request not allowed." }, 403);
  if (!hasSession(request)) return reply({ error: "Please sign in again." }, 401);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return reply({ error: "GEMINI_API_KEY is missing in Vercel." }, 503);
  const model = process.env.GEMINI_LIVE_MODEL || "gemini-3.8-live";
  if (!/^[a-zA-Z0-9.-]+$/.test(model)) return reply({ error: "Invalid Live model setting." }, 503);
  try {
    const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1beta", timeout: 20000 } });
    const token = await ai.authTokens.create({ config: {
      uses: 1,
      expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(),
      liveConnectConstraints: { model, config: LIVE_CONFIG },
    } });
    if (!token.name) throw new Error("No token");
    return reply({ token: token.name, model });
  } catch (error) {
    const status = (error as { status?: number }).status;
    return reply({ error: status === 429 ? "Google's voice quota is currently exhausted. Wait before trying again; billing has not been enabled by this app." : "Google could not start Live voice. Your text-model access does not guarantee Live access. Check your AI Studio model access and quota; this app has not enabled billing." }, status === 429 ? 429 : 502);
  }
}
