import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Trash2, FileText, Download, Image as ImageIcon } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/format";

interface Attachment {
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

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TaskAttachments({ taskId }: { taskId: string }) {
  const { user } = useAuth();
  const [items, setItems] = useState<Attachment[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pasteFocus, setPasteFocus] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pasteRef = useRef<HTMLDivElement>(null);

  // Global paste listener — capture images pasted anywhere on the page
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isEditable = tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable;
      const files: File[] = [];
      for (const item of Array.from(e.clipboardData.items)) {
        if (item.kind === "file") {
          const f = item.getAsFile();
          if (f && f.type.startsWith("image/")) files.push(f);
        }
      }
      if (files.length === 0) return;
      // If user is typing in an input/textarea, only capture if there's no text being pasted
      if (isEditable && e.clipboardData.getData("text")) return;
      e.preventDefault();
      void upload(files);
      toast.success(`Colando ${files.length} imagem(ns)...`);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, user]);

  const load = async () => {
    const { data, error } = await supabase
      .from("attachments")
      .select("*")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false });
    if (error) { toast.error(error.message); return; }
    const list = (data ?? []) as Attachment[];
    setItems(list);
    const signed: Record<string, string> = {};
    await Promise.all(list.map(async (a) => {
      const { data: s } = await supabase.storage.from(BUCKET).createSignedUrl(a.storage_path, 3600);
      if (s?.signedUrl) signed[a.id] = s.signedUrl;
    }));
    setUrls(signed);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [taskId]);

  const upload = async (files: FileList | File[]) => {
    if (!user) return;
    setBusy(true);
    for (const file of Array.from(files)) {
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`${file.name}: máximo 20MB`);
        continue;
      }
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${user.id}/${taskId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type, upsert: false,
      });
      if (upErr) { toast.error(`${file.name}: ${upErr.message}`); continue; }
      const { error: dbErr } = await supabase.from("attachments").insert([{
        task_id: taskId,
        uploaded_by: user.id,
        file_name: file.name,
        storage_path: path,
        mime_type: file.type || null,
        size_bytes: file.size,
      }]);
      if (dbErr) {
        toast.error(`${file.name}: ${dbErr.message}`);
        await supabase.storage.from(BUCKET).remove([path]);
      }
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    void load();
  };

  const remove = async (a: Attachment) => {
    if (!confirm(`Excluir "${a.file_name}"?`)) return;
    const { error } = await supabase.from("attachments").delete().eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    await supabase.storage.from(BUCKET).remove([a.storage_path]);
    setItems((p) => p.filter((x) => x.id !== a.id));
  };

  const isImage = (m: string | null) => m?.startsWith("image/");

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Anexos</CardTitle>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
          <Upload className="h-4 w-4 mr-1" /> {busy ? "Enviando..." : "Enviar"}
        </Button>
        <input
          ref={inputRef} type="file" multiple className="hidden"
          onChange={(e) => e.target.files && upload(e.target.files)}
        />
      </CardHeader>
      <CardContent>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault(); setDragOver(false);
            if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
          }}
          className={`rounded-md border-2 border-dashed p-4 text-center text-sm text-muted-foreground transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-muted"}`}
        >
          Arraste fotos ou arquivos aqui (máx. 20MB cada)
        </div>

        {items.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
            {items.map((a) => (
              <div key={a.id} className="group relative rounded-md border bg-card overflow-hidden">
                {isImage(a.mime_type) && urls[a.id] ? (
                  <a href={urls[a.id]} target="_blank" rel="noreferrer" className="block aspect-video bg-muted">
                    <img src={urls[a.id]} alt={a.file_name} className="h-full w-full object-cover" />
                  </a>
                ) : (
                  <a href={urls[a.id]} target="_blank" rel="noreferrer"
                    className="aspect-video bg-muted flex items-center justify-center">
                    <FileText className="h-10 w-10 text-muted-foreground" />
                  </a>
                )}
                <div className="p-2 text-xs">
                  <div className="font-medium truncate" title={a.file_name}>{a.file_name}</div>
                  <div className="text-muted-foreground flex items-center justify-between mt-0.5">
                    <span>{formatSize(a.size_bytes)}</span>
                    <span>{formatDateTime(a.created_at)}</span>
                  </div>
                </div>
                <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {urls[a.id] && (
                    <a href={urls[a.id]} download={a.file_name}
                      className="rounded bg-background/90 p-1 hover:bg-background border">
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <button onClick={() => remove(a)}
                    className="rounded bg-background/90 p-1 hover:bg-destructive hover:text-destructive-foreground border">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {isImage(a.mime_type) && (
                  <div className="absolute top-1 left-1 rounded bg-background/80 p-0.5 border">
                    <ImageIcon className="h-3 w-3" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
