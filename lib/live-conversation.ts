import { GoogleGenAI, type Session, type LiveServerMessage } from "@google/genai";
import { LIVE_CONFIG } from "@/lib/live-config";

type Callbacks = {
  status: (status: string) => void;
  transcript: (role: "user" | "model", text: string) => void;
  error: (message: string) => void;
  closed: () => void;
};
export class LiveConversation {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: AudioWorkletNode | null = null;
  private silent: GainNode | null = null;
  private session: Session | null = null;
  private playing = new Set<AudioBufferSourceNode>();
  private nextPlay = 0;
  private stopped = false;
  private muted = false;
  private expiry: ReturnType<typeof setTimeout> | null = null;
  private abort = new AbortController();
  constructor(private callbacks: Callbacks) {}

  async start() {
    try {
      // Start/resume during the original button gesture, before any network await.
      this.context = new AudioContext({ latencyHint: "interactive" });
      await this.context.resume();
      if (!this.context.audioWorklet) throw new Error("Live voice needs a browser with AudioWorklet support. Open this page in Safari.");
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone access is unavailable. Open this HTTPS page in Safari.");
      this.callbacks.status("Allow microphone access");
      const acquired = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (this.stopped) { acquired.getTracks().forEach(track => track.stop()); return; }
      this.stream = acquired;
      this.callbacks.status("Connecting voice…");
      await this.context.audioWorklet.addModule("/pcm-capture.js");
      if (this.stopped) return;
      const result = await fetch("/api/live-token", { method: "POST", signal: this.abort.signal });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error || "Could not start voice.");
      if (this.stopped) return;
      const ai = new GoogleGenAI({ apiKey: data.token, httpOptions: { apiVersion: "v1beta" } });
      const pending = ai.live.connect({
        model: data.model, config: LIVE_CONFIG,
        callbacks: {
          onmessage: message => { if (!this.stopped) this.receive(message); },
          onerror: () => this.fail("The voice connection failed. Check your internet and Live API access, then try again."),
          onclose: event => {
            if (!this.stopped) this.fail(event.code === 1000 ? "Voice session ended. Tap Start conversation to reconnect." : `Google closed the voice connection (${event.code}). Check Live model access or quota in AI Studio, then try again.`);
          },
        },
      });
      // Limit connection attempts without exposing the ephemeral token in errors.
      let timeout: ReturnType<typeof setTimeout> | undefined;
      pending.then(session => { if (this.stopped) session.close(); }).catch(() => {});
      try {
        this.session = await Promise.race([pending, new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("Voice connection timed out. Try again.")), 20000); })]);
      } finally { if (timeout) clearTimeout(timeout); }
      if (this.stopped) { this.session.close(); return; }
      this.source = this.context.createMediaStreamSource(this.stream);
      this.processor = new AudioWorkletNode(this.context, "raone-pcm");
      this.silent = this.context.createGain();
      this.silent.gain.value = 0;
      this.processor.port.onmessage = event => {
        if (this.stopped || this.muted || !this.session) return;
        const bytes = new Uint8Array(event.data as ArrayBuffer);
        let binary = "";
        for (const byte of bytes) binary += String.fromCharCode(byte);
        try { this.session.sendRealtimeInput({ audio: { data: btoa(binary), mimeType: "audio/pcm;rate=16000" } }); }
        catch { this.fail("The voice connection was lost. Tap Start conversation to reconnect."); }
      };
      this.source.connect(this.processor);
      this.processor.connect(this.silent);
      this.silent.connect(this.context.destination);
      this.callbacks.status("Listening");
      // End explicitly before the short-lived token expires. No silent retries/billing.
      this.expiry = setTimeout(() => this.fail("This conversation reached its time limit. Tap Start conversation to continue."), 25 * 60 * 1000);
    } catch (error) {
      if (this.stopped) return;
      const message = error instanceof Error && error.name === "NotAllowedError" ? "Microphone access was blocked. Allow it in Safari settings and try again." : error instanceof Error && !/token|api.?key|auth_tokens/i.test(error.message) && error.message.length < 350 ? error.message : "Could not start Live voice. Check Google AI Studio Live access and quota, then try again.";
      this.fail(message);
    }
  }

  private receive(message: LiveServerMessage) {
    if (message.goAway) { this.fail("Google is ending this voice session. Tap Start conversation to reconnect."); return; }
    const content = message.serverContent;
    if (!content) return;
    if (content.interrupted) this.clearPlayback();
    if (content.inputTranscription?.text) {
      this.callbacks.transcript("user", content.inputTranscription.text);
      if (!this.playing.size) this.callbacks.status("Thinking");
    }
    if (content.outputTranscription?.text) this.callbacks.transcript("model", content.outputTranscription.text);
    for (const part of content.modelTurn?.parts || []) {
      if (part.inlineData?.data && part.inlineData.mimeType?.startsWith("audio/pcm")) this.play(part.inlineData.data, part.inlineData.mimeType);
    }
    if ((content.turnComplete || content.interrupted) && !this.playing.size) this.callbacks.status(this.muted ? "Microphone muted" : "Listening");
  }

  private play(encoded: string, mimeType: string) {
    const context = this.context;
    if (!context || this.stopped) return;
    if (context.state !== "running") {
      this.fail("Your phone paused audio. Keep this page open and tap Start conversation again."); return;
    }
    const raw = atob(encoded);
    const bytes = Uint8Array.from(raw, char => char.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    const rate = Number(mimeType.match(/rate=(\d+)/)?.[1] || 24000);
    const count = Math.floor(bytes.length / 2);
    if (!count || rate < 8000 || rate > 96000) return;
    const buffer = context.createBuffer(1, count, rate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < count; i++) channel[i] = view.getInt16(i * 2, true) / 32768;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    this.nextPlay = Math.max(context.currentTime + 0.025, this.nextPlay);
    source.start(this.nextPlay);
    this.nextPlay += buffer.duration;
    this.playing.add(source);
    this.callbacks.status("Speaking");
    source.onended = () => {
      source.disconnect();
      this.playing.delete(source);
      if (!this.stopped && !this.playing.size) this.callbacks.status(this.muted ? "Microphone muted" : "Listening");
    };
  }

  setMuted(value: boolean) {
    this.muted = value;
    this.stream?.getAudioTracks().forEach(track => { track.enabled = !value; });
    if (value) this.session?.sendRealtimeInput({ audioStreamEnd: true });
    if (!this.playing.size) this.callbacks.status(value ? "Microphone muted" : "Listening");
  }
  sendText(text: string) {
    if (!this.session || this.stopped) return false;
    this.clearPlayback();
    this.callbacks.transcript("user", text);
    this.callbacks.status("Thinking");
    this.session.sendClientContent({ turns: [{ role: "user", parts: [{ text }] }], turnComplete: true });
    return true;
  }
  private clearPlayback() {
    for (const source of this.playing) { source.onended = null; try { source.stop(); } catch {} source.disconnect(); }
    this.playing.clear();
    this.nextPlay = 0;
  }
  private fail(message: string) {
    if (this.stopped) return;
    this.callbacks.error(message);
    this.stop();
  }
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.abort.abort();
    if (this.expiry) clearTimeout(this.expiry);
    this.clearPlayback();
    this.session?.close();
    if (this.processor) { this.processor.port.onmessage = null; this.processor.disconnect(); }
    this.source?.disconnect(); this.silent?.disconnect();
    this.stream?.getTracks().forEach(track => track.stop());
    if (this.context && this.context.state !== "closed") void this.context.close().catch(() => {});
    this.callbacks.closed();
  }
}
