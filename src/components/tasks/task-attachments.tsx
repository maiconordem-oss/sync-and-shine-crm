import { ChangeEvent, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Trash2, FileText, Download, Image as ImageIcon, Upload, File, FileSpreadsheet, Archive } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface Attachment {
  id: string;
  task_id: string;
  uploaded_by: string | null;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

const BUCKET = "attachments";
const MAX_MB = 50;

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ mime, name }: { mime: string | null; name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (mime?.startsWith("image/")) return <ImageIcon className="h-8 w-8 text-blue-500" />;
  if (mime === "application/pdf" || ext === "pdf") return <FileText className="h-8 w-8 text-rose-500" />;
  if (["xls","xlsx","csv"].includes(ext)) return <FileSpreadsheet className="h-8 w-8 text-emerald-600" />;
  if (["zip","rar","7z","tar","gz"].includes(ext)) return <Archive className="h-8 w-8 text-purple-500" />;
  return <File className="h-8 w-8 text-muted-foreground" />;
}

const isImage = (mime: string | null) => mime?.startsWith("image/") ?? false;

export function TaskAttachments({ taskId, createdBy }: { taskId: string; createdBy?: string | null }) {
  const { user, isManagerOrAdmin } = useAuth();
  const [items, setItems] = useState<Attachment[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const canUpload = !createdBy || user?.id === createdBy || isManagerOrAdmin;
  const canDelete = (a: Attachment) => a.uploaded_by === user?.id || isManagerOrAdmin;

  // Global paste listener
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!canUpload || !e.clipboardData) return;
      const files: File[] = [];
      for (const item of Array.from(e.clipboardData.items)) {
        if (item.kind === "file") { const f = item.getAsFile(); if (f) files.push(f); }
      }
      if (!files.length) return;
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if ((tag === "INPUT" || tag === "TEXTAREA") && e.clipboardData.getData("text")) return;
      e.preventDefault();
      void upload(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [taskId, user, canUpload]);

  const load = async () => {
    const { data } = await supabase.from("attachments").select("*").eq("task_id", taskId).order("created_at", { ascending: false });
    const list = (data ?? []) as Attachment[];
    setItems(list);
    const signed: Record<string, string> = {};
    await Promise.all(list.map(async (a) => {
      const { data: s } = await supabase.storage.from(BUCKET).createSignedUrl(a.storage_path, 3600 * 8);
      if (s?.signedUrl) signed[a.id] = s.signedUrl;
    }));
    setUrls(signed);
  };

  useEffect(() => { void load(); }, [taskId]);

  const upload = async (files: File[] | FileList) => {
    if (!user) return;
    setBusy(true);
    for (const file of Array.from(files)) {
      if (file.size > MAX_MB * 1024 * 1024) { toast.error(`${file.name}: máximo ${MAX_MB}MB`); continue; }
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${user.id}/${taskId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) { toast.error(`${file.name}: ${upErr.message}`); continue; }
      const { data: ins, error: dbErr } = await supabase.from("attachments").insert([{
        task_id: taskId, uploaded_by: user.id, file_name: file.name,
        storage_path: path, mime_type: file.type || null, size_bytes: file.size,
      }]).select().single();
      if (dbErr) { toast.error(dbErr.message); await supabase.storage.from(BUCKET).remove([path]); continue; }
      const a = ins as Attachment;
      setItems((p) => [a, ...p]);
      if (isImage(file.type)) {
        const blob = URL.createObjectURL(file);
        setUrls((p) => ({ ...p, [a.id]: blob }));
        const { data: s } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600 * 8);
        if (s?.signedUrl) setUrls((p) => { URL.revokeObjectURL(p[a.id] ?? ""); return { ...p, [a.id]: s.signedUrl }; });
      } else {
        const { data: s } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600 * 8);
        if (s?.signedUrl) setUrls((p) => ({ ...p, [a.id]: s.signedUrl }));
      }
      toast.success(`${file.name} enviado!`);
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const remove = async (a: Attachment) => {
    if (!confirm(`Excluir "${a.file_name}"?`)) return;
    await supabase.from("attachments").delete().eq("id", a.id);
    await supabase.storage.from(BUCKET).remove([a.storage_path]);
    setItems((p) => p.filter((x) => x.id !== a.id));
    toast.success("Arquivo removido.");
  };

  return (
    <div className="space-y-3">
      {canUpload && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); void upload(Array.from(e.dataTransfer.files)); }}
          onClick={() => fileRef.current?.click()}
          className={cn(
            "flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-4 cursor-pointer transition-all text-center",
            dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/20 hover:border-primary/40 hover:bg-muted/20",
            busy && "pointer-events-none opacity-60"
          )}
        >
          <Upload className="h-5 w-5 text-muted-foreground" />
          <div className="text-sm font-medium">{busy ? "Enviando..." : "Arraste ou clique para anexar"}</div>
          <div className="text-xs text-muted-foreground">PDF, imagens, planilhas, Word — máx. {MAX_MB}MB · Cole prints com Ctrl+V</div>
        </div>
      )}
      <input ref={fileRef} type="file" multiple accept="*/*" className="hidden"
        onChange={(e: ChangeEvent<HTMLInputElement>) => { if (e.target.files) void upload(e.target.files); }} />

      {/* Image thumbnails */}
      {items.filter((a) => isImage(a.mime_type)).length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {items.filter((a) => isImage(a.mime_type)).map((a) => (
            <div key={a.id} className="relative group rounded-lg overflow-hidden border bg-muted aspect-video">
              {urls[a.id] && <a href={urls[a.id]} target="_blank" rel="noreferrer"><img src={urls[a.id]} alt={a.file_name} className="w-full h-full object-cover" /></a>}
              <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {urls[a.id] && <a href={urls[a.id]} download={a.file_name} onClick={(e) => e.stopPropagation()} className="bg-black/60 text-white rounded-full p-1 hover:bg-primary"><Download className="h-3 w-3" /></a>}
                {canDelete(a) && <button onClick={() => remove(a)} className="bg-black/60 text-white rounded-full p-1 hover:bg-red-600"><Trash2 className="h-3 w-3" /></button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Non-image files */}
      {items.filter((a) => !isImage(a.mime_type)).map((a) => (
        <div key={a.id} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 group hover:border-primary/30 transition-colors">
          <FileIcon mime={a.mime_type} name={a.file_name} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{a.file_name}</div>
            <div className="text-xs text-muted-foreground">{formatSize(a.size_bytes)} · {formatDateTime(a.created_at)}</div>
          </div>
          <div className="flex gap-1 shrink-0">
            {urls[a.id] && (
              <a href={urls[a.id]} target="_blank" rel="noreferrer" className="p-1.5 rounded hover:bg-muted text-muted-foreground" title="Baixar/Abrir">
                <Download className="h-4 w-4" />
              </a>
            )}
            {canDelete(a) && (
              <button onClick={() => remove(a)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      ))}

      {items.length === 0 && !canUpload && <p className="text-sm text-center text-muted-foreground py-4">Nenhum anexo.</p>}
    </div>
  );
}

// Hook para thumbnail no kanban card
export function useTaskThumbnail(taskId: string | null) {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    if (!taskId) return;
    supabase.from("attachments").select("storage_path,mime_type").eq("task_id", taskId)
      .like("mime_type", "image/%").order("created_at", { ascending: true }).limit(1).maybeSingle()
      .then(async ({ data }) => {
        if (!data) return;
        const { data: s } = await supabase.storage.from("attachments").createSignedUrl(data.storage_path, 3600 * 4);
        if (s?.signedUrl) setThumb(s.signedUrl);
      });
  }, [taskId]);
  return thumb;
}
