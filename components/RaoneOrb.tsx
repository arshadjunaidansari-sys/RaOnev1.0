"use client";

import { useEffect, useRef, useState } from "react";
import { OrbScene, type OrbState } from "@/lib/orbScene";
import { HandTracker } from "@/lib/handTracker";

/**
 * RAONE's orb interface — the visual layer.
 *
 * This is the front end of a larger voice assistant. In the full system
 * the orb's state is driven by a live speech session and by tool calls
 * hitting the user's machine; here the state switcher stands in for that,
 * so the visual states can be seen without any backend running.
 *
 * The scene itself (lib/orbScene.ts) and the gesture tracking
 * (lib/handTracker.ts) are the complete, unmodified implementations.
 */

const STATES: OrbState[] = [
  "IDLE",
  "LISTENING",
  "THINKING",
  "SPEAKING",
  "TOOL_EXECUTION",
  "ERROR",
];

export default function RaoneOrb() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sceneRef = useRef<OrbScene | null>(null);
  const trackerRef = useRef<HandTracker | null>(null);
  const dragRef = useRef<{ dragging: boolean; lastX: number; lastY: number }>({
    dragging: false,
    lastX: 0,
    lastY: 0,
  });

  const [state, setState] = useState<OrbState>("IDLE");
  const [gesturesOn, setGesturesOn] = useState(false);
  const [gestureBusy, setGestureBusy] = useState(false);
  const [gestureError, setGestureError] = useState<string | null>(null);
  // Camera self-view is off by default even while gestures are on — hand
  // tracking doesn't need it visible, it's a debug aid. Press C for it.
  const [showCameraPreview, setShowCameraPreview] = useState(false);
  const [fps, setFps] = useState(0);
  const [panelVisible, setPanelVisible] = useState(false);

  // Intro video: plays on load over the orb, fades out on first interaction
  // so the scene underneath is revealed. introFading drives the CSS
  // transition; introVisible unmounts it afterwards so it stops costing
  // compositing work once invisible.
  const [introVisible, setIntroVisible] = useState(false);
  const [introFading, setIntroFading] = useState(false);
  const INTRO_FADE_MS = 2800;

  const dismissIntro = () => {
    if (!introVisible || introFading) return;
    setIntroFading(true);
    setTimeout(() => setIntroVisible(false), INTRO_FADE_MS);
  };

  // Polls the scene's rolling FPS counter. A plain setInterval survives a
  // backgrounded tab better than an ad-hoc rAF probe would.
  useEffect(() => {
    const interval = setInterval(() => {
      const scene = sceneRef.current;
      if (scene) setFps(scene.getFps());
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // mount the scene once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = new OrbScene(canvas);
    sceneRef.current = scene;
    scene.setState("IDLE");
    scene.start();

    const resize = () => scene.resize(window.innerWidth, window.innerHeight);
    resize();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // The assistant drives the visual state without exposing any API keys.
  useEffect(() => {
    const update = (event: Event) => {
      const next = (event as CustomEvent<OrbState>).detail;
      if (!STATES.includes(next)) return;
      setState(next);
      sceneRef.current?.setState(next);
    };
    window.addEventListener("raone-state", update);
    return () => window.removeEventListener("raone-state", update);
  }, []);

  // mouse / touch drag + scroll zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onPointerDown = (e: PointerEvent) => {
      dragRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragRef.current.dragging) return;
      const dx = e.clientX - dragRef.current.lastX;
      const dy = e.clientY - dragRef.current.lastY;
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
      sceneRef.current?.setRotationDelta(dx * 0.005, dy * 0.005);
    };
    const onPointerUp = (e: PointerEvent) => {
      dragRef.current.dragging = false;
      canvas.releasePointerCapture(e.pointerId);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      sceneRef.current?.setZoomDelta(e.deltaY * 0.003);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, []);

  const toggleGestures = async () => {
    dismissIntro();
    if (gesturesOn) {
      trackerRef.current?.stop();
      trackerRef.current = null;
      setGesturesOn(false);
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    setGestureBusy(true);
    setGestureError(null);
    try {
      const tracker = new HandTracker();
      await tracker.start(video, (gesture) => {
        if (gesture.type === "rotate") {
          sceneRef.current?.setRotationDelta(gesture.dx, gesture.dy);
        } else if (gesture.type === "zoom") {
          sceneRef.current?.setZoomDelta(-gesture.delta);
        }
      });
      trackerRef.current = tracker;
      setGesturesOn(true);
    } catch (err) {
      setGestureError(err instanceof Error ? err.message : "Camera access failed");
    } finally {
      setGestureBusy(false);
    }
  };

  const applyState = (s: OrbState) => {
    dismissIntro();
    setState(s);
    sceneRef.current?.setState(s);
  };

  // keyboard: G gestures, C camera self-view, D panel, R reset, +/- zoom
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable=true]")) return;
      if (e.key === "g" || e.key === "G") void toggleGestures();
      else if (e.key === "c" || e.key === "C") setShowCameraPreview((p) => !p);
      else if (e.key === "d" || e.key === "D") setPanelVisible((p) => !p);
      else if (e.key === "r" || e.key === "R") sceneRef.current?.resetView();
      else if (e.key === "+" || e.key === "=") sceneRef.current?.setZoomDelta(-0.4);
      else if (e.key === "-" || e.key === "_") sceneRef.current?.setZoomDelta(0.4);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gesturesOn, introVisible, introFading]);

  useEffect(() => {
    return () => {
      trackerRef.current?.stop();
    };
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#05070c" }}>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />

      {introVisible && (
        <video
          autoPlay
          muted
          loop
          playsInline
          src="/videos/raone-intro.mp4"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            zIndex: 1,
            opacity: introFading ? 0 : 1,
            transition: `opacity ${INTRO_FADE_MS}ms ease`,
            pointerEvents: "none",
          }}
        />
      )}

      {/* Capture source for hand tracking — always mounted while gestures
          are on, but only visible when the self-view is toggled. */}
      <video
        ref={videoRef}
        muted
        playsInline
        style={{
          position: "absolute",
          bottom: 16,
          left: 16,
          width: gesturesOn && showCameraPreview ? 160 : 0,
          height: gesturesOn && showCameraPreview ? 120 : 0,
          borderRadius: 8,
          border: gesturesOn && showCameraPreview ? "1px solid #2ea6ff" : "none",
          opacity: gesturesOn && showCameraPreview ? 0.85 : 0,
          transform: "scaleX(-1)",
          transition: "opacity 0.2s",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: "max(16px, env(safe-area-inset-top))",
          left: 16,
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          fontSize: 12,
          letterSpacing: "0.05em",
        }}
      >
        <button onClick={toggleGestures} disabled={gestureBusy} style={buttonStyle(gesturesOn)}>
          {gestureBusy ? "REQUESTING CAMERA…" : gesturesOn ? "GESTURES ON" : "GESTURES OFF"}
        </button>
        {gestureError && <div style={{ color: "#ff6b6b", maxWidth: 220 }}>{gestureError}</div>}
      </div>

      {panelVisible && (
        <div
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            zIndex: 2,
            width: 260,
            maxWidth: "calc(100vw - 32px)",
            background: "rgba(0,0,0,0.55)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 8,
            padding: 10,
            fontSize: 10,
            lineHeight: 1.6,
            color: "#8fa8c0",
          }}
        >
          <div style={{ opacity: 0.75, marginBottom: 8 }}>
            orb: {state} · fps: {fps.toFixed(0)}
          </div>
          <div style={{ opacity: 0.85, marginBottom: 6 }}>controls</div>
          <div style={{ opacity: 0.6 }}>G — gestures</div>
          <div style={{ opacity: 0.6 }}>C — camera self-view</div>
          <div style={{ opacity: 0.6 }}>D — hide this panel</div>
          <div style={{ opacity: 0.6 }}>R — reset view</div>
          <div style={{ opacity: 0.6 }}>+ / − — zoom</div>
          <div style={{ opacity: 0.6 }}>drag — rotate · scroll — zoom</div>
        </div>
      )}

      {false && <> {/* In the full system these states are driven by a live voice
          session. Here they're switchable so the visuals can be seen
          standalone. */}
      <div
        style={{
          position: "absolute",
          bottom: 16,
          right: 16,
          zIndex: 2,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "flex-end",
          gap: 6,
          fontSize: 11,
          maxWidth: "calc(100vw - 32px)",
        }}
      >
        {STATES.map((s) => (
          <button key={s} onClick={() => applyState(s)} style={buttonStyle(state === s)}>
            {s}
          </button>
        ))}
      </div></>}
    </div>
  );
}

function buttonStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? "rgba(46,166,255,0.25)" : "rgba(255,255,255,0.05)",
    border: `1px solid ${active ? "#2ea6ff" : "rgba(255,255,255,0.2)"}`,
    color: active ? "#bfe8ff" : "#8fa8c0",
    borderRadius: 6,
    padding: "6px 10px",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: "inherit",
    letterSpacing: "0.04em",
  };
}
