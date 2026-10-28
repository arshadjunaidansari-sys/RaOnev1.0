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

## Personal iPhone assistant — Live conversation

This fork adds Gemini Live audio-to-audio conversation. Sign in once, tap Start conversation,
and speak normally. Google detects the end of your turn and responds aloud automatically.
There are no per-turn Talk, Send or Read answer buttons. Native audio uses the Puck voice;
the browser's speech-synthesis voice is not used. An optional Type instead panel remains.

### Vercel settings

Keep these server-only Production environment variables, then redeploy:

- `GEMINI_API_KEY`: your Google AI Studio key.
- `RAONE_ACCESS_CODE`: your existing long private passphrase.
- `GEMINI_LIVE_MODEL` (optional): defaults to `gemini-3.8-live`. This must be a Live audio model
  available to your Google project, independent of your text model.
- `GEMINI_MODEL` (optional): text-only fallback, defaults to `gemini-3.1-flash-lite`.

The app does not enable billing or change Google account settings. Live access and free quota
must be checked in your own AI Studio project. Errors do not silently switch to paid providers.

### iPhone usage and privacy

Use normal Safari for persistent sign-in. Sign-in uses a signed HttpOnly, SameSite=Strict cookie,
valid for 30 days; the raw passphrase is not stored in localStorage. Private browsing or clearing
site data may erase the cookie. Sign out clears it. Changing RAONE_ACCESS_CODE invalidates all
existing cookies after redeployment.

One Start conversation tap unlocks audio playback and asks for microphone permission. Audio is
captured via AudioWorklet, resampled to mono 16-bit PCM at 16 kHz, and streamed directly to
Google using a single-use, short-lived token issued by the server. The main API key never leaves
the server. Google returns PCM voice audio, played automatically in a scheduled audio queue.
Voice activity detection and interruption handling remove the per-turn button sequence.

Keep the page open during conversations. Switching apps or hiding the page ends the session
and releases the microphone. Mute pauses microphone transmission; End conversation stops
microphone tracks, queued playback and the Google connection. Connections end after 25 minutes
or if Google terminates them; reconnect explicitly with Start conversation. No automatic retry loop.

Only the current page's transcript is shown. There is no persistent conversation memory, device
control, email, WhatsApp or calendar integration. Audio and transcripts are processed by Google
under the policies for your API project. The optional typed fallback uses the text endpoint and
returns text only when no live voice session is active.

Live access and iPhone microphone/speaker behavior require testing on the actual device. Local
checks cover build, lint, cookie authentication, worklet resampling and simulated voice events.
