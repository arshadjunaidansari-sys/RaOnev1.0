"use client";

import { FormEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { OrbState } from "@/lib/orbScene";

type Message = { role: "user" | "model"; text: string };
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void; abort: () => void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
const subscribeCapabilities = () => () => {};
const getServerCapabilities = () => 0;
const getCapabilities = () => {
  const w = window as SpeechWindow;
  return (w.SpeechRecognition || w.webkitSpeechRecognition ? 1 : 0) | ("speechSynthesis" in window ? 2 : 0);
};
const setOrb = (state: OrbState) => window.dispatchEvent(new CustomEvent("raone-state", { detail: state }));

export default function VoiceAssistant() {
  const [accessCode, setAccessCode] = useState("");
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const capabilities = useSyncExternalStore(subscribeCapabilities, getCapabilities, getServerCapabilities);
  const canListen = Boolean(capabilities & 1);
  const canSpeak = Boolean(capabilities & 2);
  const [language, setLanguage] = useState("en-IN");
  const recognition = useRef<Recognition | null>(null);
  const controller = useRef<AbortController | null>(null);
  const speech = useRef<SpeechSynthesisUtterance | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const locked = useRef(false);

  useEffect(() => {
    return () => {
      controller.current?.abort();
      recognition.current?.abort();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  function stopSpeech() {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    speech.current = null;
    setSpeaking(false);
    setStatus("Ready");
    setOrb("IDLE");
  }

  function readAnswer(answer: string) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(answer);
    utterance.lang = /[\u0900-\u097F]/.test(answer) ? "hi-IN" : "en-IN";
    utterance.rate = 1;
    utterance.onstart = () => { setSpeaking(true); setStatus("Speaking"); setOrb("SPEAKING"); };
    utterance.onend = () => { setSpeaking(false); setStatus("Ready"); setOrb("IDLE"); };
    utterance.onerror = () => { setSpeaking(false); setStatus("Tap Read answer to hear it"); setOrb("IDLE"); };
    speech.current = utterance;
    window.speechSynthesis.speak(utterance);
  }

  function startListening() {
    if (listening) { recognition.current?.stop(); return; }
    if (!accessCode.trim()) { setError("Enter your access code first."); return; }
    stopSpeech();
    const w = window as SpeechWindow;
    const Constructor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Constructor) { setError("Voice input is unavailable here. Type your question below."); return; }
    const r = new Constructor();
    recognition.current = r;
    r.lang = language;
    r.continuous = false;
    r.interimResults = false;
    r.onresult = event => {
      const transcript = Array.from(event.results).map(result => result[0].transcript).join(" ");
      setText(transcript);
      setStatus("Review your question, then tap Send");
    };
    r.onerror = event => {
      setError(event.error === "not-allowed" ? "Microphone access was blocked. Allow it in your browser settings, or type below." : `Voice input stopped (${event.error}). Try again or type your question.`);
    };
    r.onend = () => { setListening(false); setOrb("IDLE"); };
    try { r.start(); setError(""); setListening(true); setStatus("Listening — speak now"); setOrb("LISTENING"); }
    catch { setError("Could not start the microphone. Try again or type below."); }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (locked.current || listening || !text.trim() || !accessCode.trim()) return;
    locked.current = true;
    stopSpeech();
    const question = text.trim();
    const history: Message[] = [...messages.slice(-10), { role: "user", text: question }];
    setError(""); setBusy(true); setStatus("Thinking"); setOrb("THINKING");
    const abort = new AbortController();
    controller.current = abort;
    const timer = setTimeout(() => abort.abort(), 30000);
    try {
      const result = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json", "x-raone-access-code": accessCode }, body: JSON.stringify({ messages: history }), signal: abort.signal });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error || "Could not get an answer.");
      if (typeof data.text !== "string") throw new Error("The server returned an invalid answer.");
      setMessages([...history, { role: "model", text: data.text }]);
      setText(""); setStatus("Answer ready"); setOrb("IDLE");
      // Explicit playback keeps voice reliable on iPhone browsers that require a tap.
    } catch (e) {
      setError(e instanceof Error && e.name !== "AbortError" ? e.message : "Request cancelled or timed out. You can try again.");
      setStatus("Please try again"); setOrb("ERROR");
    } finally { clearTimeout(timer); setBusy(false); locked.current = false; controller.current = null; }
  }

  const lastAnswer = [...messages].reverse().find(message => message.role === "model")?.text;
  return <section className="assistant" aria-label="RaOne assistant">
    <header className="assistant-heading"><strong>RAONE</strong><span role="status" aria-live="polite">{status}</span></header>
    <details className="assistant-settings" open={!accessCode}>
      <summary>Access & voice settings</summary>
      <label htmlFor="access-code">Your private access code</label>
      <input id="access-code" type="password" autoComplete="off" value={accessCode} onChange={e => setAccessCode(e.target.value)} placeholder="Enter your access code" maxLength={200} />
      <label htmlFor="voice-language">Speaking language</label>
      <select id="voice-language" value={language} onChange={e => setLanguage(e.target.value)}><option value="en-IN">English (India)</option><option value="hi-IN">Hindi (India)</option></select>
      <p>This is your RAONE_ACCESS_CODE, not your Gemini API key.</p>
    </details>
    <div className="assistant-log" ref={log} role="log" aria-label="Conversation">
      {messages.length === 0 ? <p className="assistant-empty">Ready, Boss. Ask me a question.<br />This conversation lasts until you reload the page.</p> : messages.map((message, index) => <div className={`assistant-message ${message.role}`} key={index}><strong>{message.role === "user" ? "You" : "RaOne"}</strong><p>{message.text}</p></div>)}
    </div>
    {error && <p className="assistant-error" role="alert">{error}</p>}
    <form onSubmit={send}>
      <label htmlFor="question">Your question</label>
      <textarea id="question" value={text} onChange={e => setText(e.target.value)} maxLength={4000} rows={2} placeholder="Type here, or use Talk…" disabled={busy} />
      <div className="assistant-actions">
        <button type="button" onClick={startListening} disabled={busy || !canListen} aria-pressed={listening}>{listening ? "Stop listening" : "Talk"}</button>
        <button type="submit" className="assistant-primary" disabled={busy || listening || !text.trim() || !accessCode.trim()}>{busy ? "Thinking…" : "Send"}</button>
        {busy && <button type="button" onClick={() => controller.current?.abort()}>Cancel</button>}
        {lastAnswer && canSpeak && <button type="button" disabled={busy || listening} onClick={() => speaking ? stopSpeech() : readAnswer(lastAnswer)}>{speaking ? "Stop voice" : "Read answer"}</button>}
      </div>
    </form>
    <p className="assistant-note">{canListen ? "Tap Talk, speak, then Send. Tap Read answer for voice playback." : "Voice input is unavailable in this browser. You can still type questions."} Questions go to Google Gemini; speech recognition may use your browser’s speech service. Keep this page open while talking.</p>
  </section>;
}
