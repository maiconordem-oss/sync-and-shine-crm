import { Download, FileIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AttachmentMeta {
  url: string; // storage path (no signed)
  type: "image" | "audio" | "video" | "file";
  name: string;
  size?: number | null;
  mime?: string | null;
}

function humanSize(n?: number | null) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// In-memory cache de signed URLs por path (TTL 50 min; supabase devolve 60 min)
const URL_TTL_MS = 50 * 60 * 1000;
const urlCache = new Map<string, { url: string; expires: number }>();

async function getSignedUrl(path: string): Promise<string | null> {
  const cached = urlCache.get(path);
  if (cached && cached.expires > Date.now()) return cached.url;
  const { data } = await supabase.storage
    .from("chat-attachments")
    .createSignedUrl(path, 60 * 60);
  const url = data?.signedUrl ?? null;
  if (url) urlCache.set(path, { url, expires: Date.now() + URL_TTL_MS });
  return url;
}

export function useSignedUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(() =>
    path ? (urlCache.get(path)?.url ?? null) : null,
  );
  useEffect(() => {
    if (!path) { setUrl(null); return; }
    let cancelled = false;
    void getSignedUrl(path).then((u) => { if (!cancelled) setUrl(u); });
    return () => { cancelled = true; };
  }, [path]);
  return url;
}

export function MessageAttachment({ meta }: { meta: AttachmentMeta }) {
  const signed = useSignedUrl(meta.url);
  if (!signed) return <div className="text-xs text-muted-foreground italic">carregando anexo…</div>;

  if (meta.type === "image") {
    return (
      <a href={signed} target="_blank" rel="noreferrer" className="block">
        <img src={signed} alt={meta.name} className="max-w-[260px] max-h-[260px] rounded-md object-cover" />
      </a>
    );
  }
  if (meta.type === "audio") {
    return (
      <audio
        src={signed}
        controls
        preload="metadata"
        playsInline
        className="max-w-[260px] block"
      />
    );
  }
  if (meta.type === "video") {
    return (
      <video
        src={signed}
        controls
        preload="metadata"
        playsInline
        className="max-w-[280px] max-h-[280px] rounded-md block"
      />
    );
  }
  return (
    <a
      href={signed}
      target="_blank"
      rel="noreferrer"
      download={meta.name}
      className="flex items-center gap-2 rounded-md border bg-background/50 px-2 py-1.5 hover:bg-background"
    >
      <FileIcon className="h-4 w-4 shrink-0" />
      <span className="text-xs truncate max-w-[180px]">{meta.name}</span>
      <span className="text-[10px] text-muted-foreground">{humanSize(meta.size)}</span>
      <Download className="h-3.5 w-3.5 ml-1 opacity-60" />
    </a>
  );
}
