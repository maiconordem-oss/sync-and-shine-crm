import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Link2, Plus, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface TaskLink {
  id: string;
  url: string;
  title: string | null;
  added_by: string | null;
  created_at: string;
}

function getDomain(url: string) {
  try { return new URL(url).hostname.replace("www.", ""); } catch { return url; }
}

function getFavicon(url: string) {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=16`; } catch { return null; }
}

export function TaskLinks({ taskId, canEdit }: { taskId: string; canEdit: boolean }) {
  const { user } = useAuth();
  const [links, setLinks] = useState<TaskLink[]>([]);
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("task_links").select("*").eq("task_id", taskId).order("created_at");
    setLinks((data ?? []) as TaskLink[]);
  };

  useEffect(() => { void load(); }, [taskId]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || !user) return;
    let finalUrl = url.trim();
    if (!finalUrl.startsWith("http")) finalUrl = "https://" + finalUrl;
    setBusy(true);
    const { data, error } = await supabase.from("task_links").insert([{
      task_id: taskId,
      url: finalUrl,
      title: title.trim() || getDomain(finalUrl),
      added_by: user.id,
    }]).select().single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setLinks((l) => [...l, data as TaskLink]);
    setUrl(""); setTitle(""); setAdding(false);
    toast.success("Link adicionado!");
  };

  const remove = async (id: string) => {
    await supabase.from("task_links").delete().eq("id", id);
    setLinks((l) => l.filter((x) => x.id !== id));
  };

  return (
    <div className="space-y-2">
      {links.length === 0 && !adding && (
        canEdit ? null : <p className="text-xs text-muted-foreground">Nenhum link.</p>
      )}

      {links.map((link) => (
        <div key={link.id} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 group hover:border-primary/30 transition-colors">
          <img
            src={getFavicon(link.url) ?? ""}
            alt=""
            className="h-4 w-4 shrink-0 rounded-sm"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate">{link.title ?? getDomain(link.url)}</div>
            <div className="text-[10px] text-muted-foreground truncate">{getDomain(link.url)}</div>
          </div>
          <a
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className="p-1 rounded text-muted-foreground hover:text-primary"
            title="Abrir link"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          {canEdit && (
            <button
              onClick={() => remove(link.id)}
              className="p-1 rounded text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}

      {adding ? (
        <form onSubmit={add} className="rounded-lg border bg-muted/20 p-3 space-y-2">
          <Input
            placeholder="https://..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="h-7 text-xs"
            autoFocus
          />
          <Input
            placeholder="Título (opcional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-7 text-xs"
          />
          <div className="flex gap-1">
            <Button type="submit" size="sm" className="h-7 text-xs px-2" disabled={busy || !url.trim()}>
              Adicionar
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs px-2"
              onClick={() => { setAdding(false); setUrl(""); setTitle(""); }}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : canEdit && (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar link
        </button>
      )}
    </div>
  );
}
