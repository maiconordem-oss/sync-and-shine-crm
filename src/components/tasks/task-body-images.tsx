import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Image, X, Loader2, ClipboardPaste, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BodyImage {
  url: string;
  path: string;
  name: string;
}

interface Props {
  taskId?: string;
  images: BodyImage[];
  onChange: (imgs: BodyImage[]) => void;
  disabled?: boolean;
}

const BUCKET = "attachments";

export function TaskBodyImages({ taskId, images, onChange, disabled }: Props) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pasteReady, setPasteReady] = useState(false);

  // ── upload helper ──────────────────────────────────────────────────────────
  const uploadFiles = useCallback(async (files: File[]) => {
    if (!user || files.length === 0) return;
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) { toast.error("Somente imagens são aceitas."); return; }

    setUploading(true);
    const folder = taskId ? `${user.id}/${taskId}` : `${user.id}/drafts`;
    const newImgs: BodyImage[] = [];

    for (const file of imageFiles) {
      if (file.size > 15 * 1024 * 1024) { toast.error(`${file.name}: máximo 15 MB`); continue; }
      const ext = file.name.split(".").pop() ?? "png";
      const path = `${folder}/body_${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
      if (upErr) { toast.error(upErr.message); continue; }
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600 * 24 * 7);
      if (signed?.signedUrl) newImgs.push({ url: signed.signedUrl, path, name: file.name });
    }

    onChange([...images, ...newImgs]);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }, [user, taskId, images, onChange]);

  // ── global paste (Ctrl+V anywhere on the page) ────────────────────────────
  useEffect(() => {
    if (disabled) return;
    const onPaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const files: File[] = [];
      for (const item of Array.from(e.clipboardData.items)) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length === 0) return;
      // don't intercept if user is typing text in an input/textarea
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if ((tag === "INPUT" || tag === "TEXTAREA") && e.clipboardData.getData("text")) return;
      e.preventDefault();
      toast.success(`Colando ${files.length} imagem${files.length > 1 ? "ns" : ""}...`);
      void uploadFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [disabled, uploadFiles]);

  // ── drag & drop ───────────────────────────────────────────────────────────
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    void uploadFiles(files);
  };

  // ── remove ────────────────────────────────────────────────────────────────
  const remove = async (img: BodyImage) => {
    await supabase.storage.from(BUCKET).remove([img.path]);
    onChange(images.filter((i) => i.path !== img.path));
  };

  if (disabled && images.length === 0) return null;

  return (
    <div className="space-y-2">
      {/* Image grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {images.map((img) => (
            <div key={img.path} className="relative group rounded-lg overflow-hidden border bg-muted aspect-video">
              <a href={img.url} target="_blank" rel="noreferrer" className="block w-full h-full">
                <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
              </a>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(img)}
                  className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Drop / paste zone */}
      {!disabled && (
        <div
          ref={dropRef}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 cursor-pointer transition-all select-none",
            dragOver
              ? "border-primary bg-primary/10 scale-[1.01]"
              : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30",
            uploading && "opacity-60 pointer-events-none",
          )}
        >
          {uploading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Enviando...
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                  <ClipboardPaste className="h-5 w-5" />
                  <span className="text-xs font-medium">Ctrl+V</span>
                </div>
                <div className="text-muted-foreground/40 text-lg font-light">|</div>
                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                  <Upload className="h-5 w-5" />
                  <span className="text-xs font-medium">Arquivo</span>
                </div>
                <div className="text-muted-foreground/40 text-lg font-light">|</div>
                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                  <Image className="h-5 w-5" />
                  <span className="text-xs font-medium">Arrastar</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Cole um print (<kbd className="px-1 py-0.5 rounded border text-[10px] bg-muted">Ctrl+V</kbd>), arraste uma imagem ou clique para selecionar
              </p>
            </>
          )}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          void uploadFiles(Array.from(e.target.files ?? []));
        }}
      />
    </div>
  );
}
