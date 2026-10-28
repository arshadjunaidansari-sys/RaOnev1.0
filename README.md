# RAONE — Orb UI

**Frontend only · Backend coming soon**

The interface layer of **RAONE**, a real-time voice assistant for macOS.

This repository contains the Three.js orb, its shader and post-processing stack, and MediaPipe hand-gesture control. It runs standalone — no backend, no API keys, no configuration.

The voice pipeline, tool server, and memory system aren't here yet. They'll be uploaded separately.

![The RAONE orb in its SPEAKING state](docs/orb.png)

---

## What's here

| | |
|---|---|
| **The orb** | Layered wireframe shells, a spiral inner core, a particle-assembled avatar, floating code-text sprites, and an orbiting graph visualization — all custom Three.js with hand-written shaders. |
| **Post-processing** | Bloom and chromatic aberration through an `EffectComposer` pass stack. |
| **Six visual states** | `IDLE` · `LISTENING` · `THINKING` · `SPEAKING` · `TOOL_EXECUTION` · `ERROR`, each with its own colour, motion and intensity. |
| **Hand gestures** | Webcam hand tracking via MediaPipe — pinch to zoom, move to rotate. Runs entirely in the browser. |
| **Direct controls** | Mouse drag to rotate, scroll to zoom, keyboard shortcuts. |

In the full system the orb's state is driven by a live speech session and by tool calls executing on the machine. Here, a state switcher stands in for that so the visuals can be explored on their own.

---

## Running it

```bash
git clone https://github.com/suvamneog/RaOnev1.0.git
cd RaOnev1.0
npm install
npm run dev
```

Open <http://localhost:3000>. Nothing else to configure.

Gestures ask for camera permission when you enable them; everything else works without it.

---

## Controls

| Input | Action |
|---|---|
| `G` | Toggle hand-gesture tracking |
| `C` | Toggle the camera self-view |
| `D` | Toggle the info panel |
| `R` | Reset the view |
| `+` / `−` | Zoom |
| Drag | Rotate |
| Scroll | Zoom |
| State buttons | Switch the orb's visual state |

---

## Structure

```
app/          Next.js app shell
components/   RaoneOrb.tsx — canvas, controls, gesture wiring
lib/
  orbScene.ts     the full Three.js scene, shaders and post-processing
  handTracker.ts  MediaPipe hand tracking and gesture recognition
public/       static assets
```

`lib/orbScene.ts` and `lib/handTracker.ts` are the complete, unmodified implementations from the full project.

---

## Built with

Next.js 16 · React 19 · Three.js · MediaPipe Tasks Vision · TypeScript

## Personal iPhone assistant

This fork adds a server-side Gemini text connection, optional browser speech recognition,
and device speech playback. The original orb follows listening, thinking and speaking states.
It does not control devices or connect to email/WhatsApp.

Set these **server-only** environment variables in Vercel Production, then redeploy:

- `GEMINI_API_KEY`: your private Google AI Studio API key.
- `RAONE_ACCESS_CODE`: a long, unique private passphrase. Enter this passphrase in the app;
  never enter your Gemini key in the app. The server refuses requests until both variables exist.
- `GEMINI_MODEL` (optional): an available Gemini text model. Default: `gemini-3.1-flash-lite`.
  Check model availability and free quota in your own AI Studio project.

Open the HTTPS deployment in iPhone Safari. Enter your access code, tap Talk, allow microphone
access, speak, review the transcript, and Send. Tap Read answer for spoken playback. Browser
speech recognition depends on browser/device support and permissions; typed input remains
available. Voice playback uses your device's voices, not Gemini generated audio. Keep the
page open during a conversation. This is not an always-listening background assistant.

Conversation history and the access code stay in page memory and are cleared on reload.
Questions and recent conversation turns are sent to Google Gemini; your browser may send
speech to its own recognition service. Treat the access code like a password; do not publish it.
API errors expose friendly setup/quota messages instead of raw provider responses.

Validation: TypeScript, ESLint and production build, plus mocked route checks for missing
configuration, incorrect access code, cross-origin requests, invalid payloads, valid answers
and quota errors. Live Gemini responses and iPhone microphone/playback require testing with
your deployed environment and device.
