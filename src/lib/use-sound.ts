import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";

export type SoundType = "status_change" | "task_complete" | "new_comment" | "mention";

// Singleton AudioContext shared across the app
let sharedCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!sharedCtx) {
    sharedCtx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  return sharedCtx;
}

// Unlock AudioContext on first user interaction (browser autoplay policy)
export function unlockAudio() {
  try {
    const ctx = getCtx();
    if (ctx.state === "suspended") void ctx.resume();
    // Play a silent buffer to fully unlock on iOS/Safari
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  } catch { /* ignore */ }
}

if (typeof window !== "undefined") {
  ["click", "keydown", "touchstart", "pointerdown"].forEach((evt) =>
    window.addEventListener(evt, unlockAudio, { capture: true, passive: true })
  );
}

const SOUNDS: Record<SoundType, { notes: number[]; dur: number; wave: OscillatorType; vol: number }> = {
  status_change: { notes: [440, 554],     dur: 0.12, wave: "sine",     vol: 0.15 },
  task_complete: { notes: [523, 659, 784], dur: 0.10, wave: "sine",     vol: 0.18 },
  new_comment:   { notes: [392, 494],      dur: 0.10, wave: "sine",     vol: 0.10 },
  mention:       { notes: [880, 1108],     dur: 0.09, wave: "triangle", vol: 0.14 },
};

export function useSound() {
  const { soundEnabled } = useAuth();
  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

  const play = useCallback((type: SoundType) => {
    if (!soundEnabledRef.current) return;
    try {
      const ctx = getCtx();
      // Resume if suspended (browser policy)
      const doPlay = () => {
        const { notes, dur, wave, vol } = SOUNDS[type];
        const gain = ctx.createGain();
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(vol, ctx.currentTime);

        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          osc.type = wave;
          osc.frequency.setValueAtTime(freq, ctx.currentTime + i * dur);
          osc.connect(gain);
          osc.start(ctx.currentTime + i * dur);
          osc.stop(ctx.currentTime + i * dur + dur + 0.05);
        });

        const total = dur * notes.length;
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + total + 0.08);
      };

      if (ctx.state === "suspended") {
        ctx.resume().then(doPlay).catch(() => {});
      } else {
        doPlay();
      }
    } catch { /* AudioContext not supported */ }
  }, []);

  return { play };
}
