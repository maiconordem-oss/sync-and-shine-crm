import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  onRecorded: (blob: Blob, durationMs: number) => void;
  disabled?: boolean;
}

export function AudioRecorder({ onRecorded, disabled }: Props) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => () => stop(true), []); // cleanup
  // eslint-disable-next-line react-hooks/exhaustive-deps

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      cancelledRef.current = false;
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const dur = Date.now() - startedAtRef.current;
        if (cancelledRef.current) return;
        const blob = new Blob(chunksRef.current, { type: mime });
        if (blob.size > 0) onRecorded(blob, dur);
      };
      rec.start();
      recorderRef.current = rec;
      startedAtRef.current = Date.now();
      setRecording(true);
      setElapsed(0);
      timerRef.current = window.setInterval(() => {
        setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 250);
    } catch {
      alert("Não foi possível acessar o microfone.");
    }
  };

  const stop = (cancel = false) => {
    if (timerRef.current !== null) { window.clearInterval(timerRef.current); timerRef.current = null; }
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      cancelledRef.current = cancel;
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    setRecording(false);
  };

  if (!recording) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-10 w-10 shrink-0"
        onClick={() => void start()}
        disabled={disabled}
        title="Gravar áudio"
      >
        <Mic className="h-4 w-4" />
      </Button>
    );
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  return (
    <div className="flex items-center gap-1 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1">
      <span className={cn("h-2 w-2 rounded-full bg-red-500 animate-pulse")} />
      <span className="text-xs font-mono tabular-nums">{mm}:{ss}</span>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => stop(true)} title="Cancelar">
        <X className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" size="icon" className="h-7 w-7" onClick={() => stop(false)} title="Enviar">
        <Square className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
