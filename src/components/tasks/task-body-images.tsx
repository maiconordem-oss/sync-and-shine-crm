import { ChangeEvent, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Image, X, Loader2, Upload } from "lucide-react";

interface UploadedImage {
  url: string;
  path: string;
  name: string;
}

interface Props {
  taskId?: string; // undefined = pre-creation (upload to temp bucket, attach after)
  images: UploadedImage[];
  onChange: (imgs: UploadedImage[]) => void;
  disabled?: boolean;
}

const BUCKET = "attachments";

export function TaskBodyImages({ taskId, images, onChange, disabled }: Props) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (files: FileList | null) => {
    if (!files || !user) return;
    setUploading(true);
    const folder = taskId ? `${user.id}/${taskId}` : `${user.id}/drafts`;
    const newImgs: UploadedImage[] = [];

    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) { toast.error(`${file.name}: somente imagens`); continue; }
      if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name}: máximo 10MB`); continue; }
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${folder}/body_${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
      if (error) { toast.error(`${file.name}: ${error.message}`); continue; }
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600 * 24 * 7);
      if (signed?.signedUrl) newImgs.push({ url: signed.signedUrl, path, name: file.name });
    }

    onChange([...images, ...newImgs]);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const remove = async (img: UploadedImage) => {
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
              <a href={img.url} target="_blank" rel="noreferrer">
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

      {/* Upload trigger */}
      {!disabled && (
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e: ChangeEvent<HTMLInputElement>) => void upload(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed rounded-lg px-3 py-2 w-full justify-center hover:border-primary/50 transition-colors disabled:opacity-50"
          >
            {uploading ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Enviando...</>
            ) : (
              <><Image className="h-3.5 w-3.5" /> Adicionar imagens ao corpo</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
