import { useCallback, useRef } from "react";
import { useAuth } from "@/lib/auth-context";

type SoundType = "status_change" | "task_complete" | "new_comment" | "mention";

export function useSound() {
  const { soundEnabled } = useAuth();
  const ctx = useRef<AudioContext | null>(null);

  const getCtx = () => {
    if (!ctx.current) ctx.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    return ctx.current;
  };

  const play = useCallback((type: SoundType) => {
    if (!soundEnabled) return;
    try {
      const ac = getCtx();
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.connect(g);
      g.connect(ac.destination);

      const configs: Record<SoundType, { freq: number[]; dur: number; wave: OscillatorType }> = {
        status_change:  { freq: [440, 523], dur: 0.25, wave: "sine" },
        task_complete:  { freq: [523, 659, 784], dur: 0.15, wave: "sine" },
        new_comment:    { freq: [392], dur: 0.15, wave: "sine" },
        mention:        { freq: [880, 1046], dur: 0.15, wave: "triangle" },
      };

      const { freq, dur, wave } = configs[type];
      o.type = wave;
      g.gain.setValueAtTime(0.12, ac.currentTime);

      freq.forEach((f, i) => {
        o.frequency.setValueAtTime(f, ac.currentTime + i * dur);
      });

      const total = dur * freq.length;
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + total + 0.05);
      o.start(ac.currentTime);
      o.stop(ac.currentTime + total + 0.1);
    } catch {
      // AudioContext not supported
    }
  }, [soundEnabled]);

  return { play };
}
