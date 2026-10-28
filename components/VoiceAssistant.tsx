"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import { LiveConversation } from "@/lib/live-conversation";
import type { OrbState } from "@/lib/orbScene";

type Message = { role: "user" | "model"; text: string };
const orb = (detail: OrbState) => window.dispatchEvent(new CustomEvent("raone-state", { detail }));
export default function VoiceAssistant() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Ready");
  const [active, setActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [muted, setMuted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [textBusy, setTextBusy] = useState(false);
  const call = useRef<LiveConversation | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const textAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/session", { cache: "no-store", signal: controller.signal }).then(result => result.json()).then(data => setAuthenticated(Boolean(data.authenticated))).catch(() => { if (!controller.signal.aborted) setAuthenticated(false); });
    const hide = () => { if (document.hidden) call.current?.stop(); };
    document.addEventListener("visibilitychange", hide);
    return () => { controller.abort(); call.current?.stop(); textAbort.current?.abort(); document.removeEventListener("visibilitychange", hide); };
  }, []);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  async function signIn(event: FormEvent) {
    event.preventDefault(); setSigningIn(true); setError("");
    try {
      const result = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error || "Sign-in failed.");
      setAuthenticated(true); setCode("");
    } catch (e) { setError(e instanceof Error ? e.message : "Sign-in failed. Try again."); }
    finally { setSigningIn(false); }
  }
  function start() {
    if (call.current || textBusy) return;
    setError(""); setConnecting(true); setMuted(false);
    const next = new LiveConversation({
      status: value => {
        setStatus(value);
        if (["Listening", "Speaking", "Thinking"].includes(value)) { setConnecting(false); setActive(true); }
        orb(value === "Speaking" ? "SPEAKING" : value === "Thinking" ? "THINKING" : value === "Listening" ? "LISTENING" : "IDLE");
      },
      transcript: (role, delta) => setMessages(previous => {
        const last = previous[previous.length - 1];
        if (last?.role === role) return [...previous.slice(0, -1), { role, text: last.text + delta }].slice(-40);
        return [...previous, { role, text: delta }].slice(-40);
      }),
      error: message => setError(message),
      closed: () => { call.current = null; setActive(false); setConnecting(false); setStatus("Ready"); setMuted(false); orb("IDLE"); },
    });
    call.current = next;
    void next.start();
  }
  async function signOut() {
    call.current?.stop(); textAbort.current?.abort();
    try {
      const result = await fetch("/api/session", { method: "DELETE" });
      if (!result.ok) throw new Error();
      setAuthenticated(false); setMessages([]); setError("");
    } catch { setError("Could not sign out. Check your connection and try again."); }
  }
  async function sendText(event: FormEvent) {
    event.preventDefault();
    const question = text.trim();
    if (!question || textBusy) return;
    if (active && call.current) { call.current.sendText(question); setText(""); return; }
    setTextBusy(true); setError(""); setStatus("Thinking"); orb("THINKING");
    const history: Message[] = [...messages.slice(-10), { role: "user", text: question }];
    const controller = new AbortController(); textAbort.current = controller;
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const result = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history }), signal: controller.signal });
      const data = await result.json();
      if (result.status === 401) setAuthenticated(false);
      if (!result.ok) throw new Error(data.error || "Could not get an answer.");
      setMessages([...history, { role: "model", text: data.text }]); setText("");
    } catch (e) { setError(e instanceof Error && e.name !== "AbortError" ? e.message : "Request timed out or was cancelled."); }
    finally { clearTimeout(timeout); setTextBusy(false); setStatus("Ready"); orb("IDLE"); }
  }

  return <section className="assistant assistant-live" aria-label="RaOne voice assistant">
    <header className="assistant-heading"><strong>RAONE</strong><span role="status" aria-live="polite">{status}</span></header>
    {authenticated === null ? <p>Checking sign-in…</p> : !authenticated ? <form onSubmit={signIn}>
      <label htmlFor="access-code">Sign in on this device</label>
      <input id="access-code" type="password" autoComplete="current-password" value={code} onChange={event => setCode(event.target.value)} maxLength={200} placeholder="Your private access code" required />
      <p className="assistant-note">Stay signed in for 30 days in this browser. Private browsing may clear your sign-in.</p>
      <div className="assistant-actions"><button className="assistant-primary" disabled={signingIn || !code.trim()}>{signingIn ? "Signing in…" : "Sign in"}</button></div>
    </form> : <>
      <p className="voice-intro">{active ? "Just speak. I’ll answer aloud automatically." : "One tap. A natural conversation."}</p>
      <div className="assistant-actions voice-controls">
        {active || connecting ? <button type="button" className="assistant-end" onClick={() => call.current?.stop()}>{connecting ? "Cancel connection" : "End conversation"}</button> : <button type="button" className="assistant-primary voice-start" onClick={start} disabled={textBusy}>Start conversation</button>}
        {active && <button type="button" onClick={() => { const value = !muted; call.current?.setMuted(value); setMuted(value); }} aria-pressed={muted}>{muted ? "Unmute microphone" : "Mute microphone"}</button>}
      </div>
      <div className="assistant-log" ref={log} role="log" aria-label="Conversation transcript" aria-live="off">
        {messages.map((message, index) => <div className={`assistant-message ${message.role}`} key={index}><strong>{message.role === "user" ? "You" : "RaOne"}</strong><p>{message.text}</p></div>)}
      </div>
      <details className="assistant-settings"><summary>Type instead</summary><form onSubmit={sendText}>
        <label htmlFor="question">Your question</label><textarea id="question" rows={2} value={text} onChange={event => setText(event.target.value)} maxLength={4000} disabled={textBusy || connecting} />
        <div className="assistant-actions"><button type="submit" disabled={textBusy || connecting || !text.trim()}>{textBusy ? "Thinking…" : "Send"}</button></div>
      </form></details>
      <div className="assistant-footer"><span>Gemini Live voice · Puck</span><button type="button" onClick={signOut}>Sign out</button></div>
      <p className="assistant-note">Microphone audio goes to Google while connected. Keep this page open; switching apps ends the call. Voice availability depends on your Google API access and quota.</p>
    </>}
    {error && <p className="assistant-error" role="alert">{error}</p>}
  </section>;
}
