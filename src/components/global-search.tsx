import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import { Search, KanbanSquare, FolderKanban, Users, X, Clock, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "@/lib/labels";

interface SearchResult {
  id: string;
  type: "task" | "project" | "member";
  title: string;
  subtitle?: string;
  url: string;
}

interface RecentItem {
  id: string;
  type: "task" | "project";
  title: string;
  url: string;
}

const RECENT_KEY = "crm_recent_search";

function getRecent(): RecentItem[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { return []; }
}
function addRecent(item: RecentItem) {
  const prev = getRecent().filter((r) => r.id !== item.id).slice(0, 4);
  localStorage.setItem(RECENT_KEY, JSON.stringify([item, ...prev]));
}

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelected(0);
      setRecent(getRecent());
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    const [tasks, projects, members] = await Promise.all([
      supabase.from("tasks").select("id,title,status").ilike("title", `%${q}%`).is("parent_task_id", null).limit(5),
      supabase.from("projects").select("id,name").ilike("name", `%${q}%`).limit(3),
      supabase.from("profiles").select("id,full_name,job_title").ilike("full_name", `%${q}%`).limit(3),
    ]);
    const r: SearchResult[] = [
      ...((tasks.data ?? []).map((t) => ({
        id: t.id, type: "task" as const,
        title: t.title,
        subtitle: STATUS_LABEL[t.status as string] ?? t.status,
        url: `/tasks/${t.id}`,
      }))),
      ...((projects.data ?? []).map((p) => ({
        id: p.id, type: "project" as const,
        title: p.name,
        subtitle: "Projeto",
        url: `/tasks?projectId=${p.id}`,
      }))),
      ...((members.data ?? []).map((m) => ({
        id: m.id, type: "member" as const,
        title: m.full_name ?? "—",
        subtitle: m.job_title ?? "Membro",
        url: `/members`,
      }))),
    ];
    setResults(r);
    setSelected(0);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void search(query), 200);
    return () => clearTimeout(timer);
  }, [query, search]);

  const items = query.trim() ? results : recent.map((r) => ({
    id: r.id, type: r.type, title: r.title, subtitle: "Recente", url: r.url,
  }));

  const go = (item: SearchResult | RecentItem) => {
    if ("type" in item && (item.type === "task" || item.type === "project")) {
      addRecent({ id: item.id, type: item.type as "task" | "project", title: item.title, url: item.url });
    }
    onClose();
    if (item.url.startsWith("/tasks/")) {
      navigate({ to: "/tasks/$taskId", params: { taskId: item.id } });
    } else if (item.url.includes("projectId")) {
      navigate({ to: "/tasks" });
    } else if (item.url === "/members") {
      navigate({ to: "/members" });
    } else {
      navigate({ to: "/tasks" });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, items.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
    if (e.key === "Enter" && items[selected]) { go(items[selected] as SearchResult); }
  };

  const iconFor = (type: string) => {
    if (type === "task") return <KanbanSquare className="h-4 w-4 text-primary/70" />;
    if (type === "project") return <FolderKanban className="h-4 w-4 text-blue-500" />;
    return <Users className="h-4 w-4 text-muted-foreground" />;
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/50 flex items-start justify-center pt-[10vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-background rounded-2xl border shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <Search className="h-5 w-5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar tarefas, projetos, membros..."
            className="flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex h-5 items-center rounded border bg-muted px-1 text-[10px] text-muted-foreground">Esc</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[360px] overflow-y-auto py-1">
          {loading && (
            <div className="px-4 py-3 text-sm text-muted-foreground">Buscando...</div>
          )}

          {!loading && !query.trim() && recent.length > 0 && (
            <div className="px-3 pb-1 pt-2">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium uppercase tracking-wide px-1 mb-1">
                <Clock className="h-3 w-3" /> Recentes
              </div>
            </div>
          )}

          {!loading && query.trim() && results.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhum resultado para "{query}"
            </div>
          )}

          {items.map((item, i) => (
            <button
              key={item.id + item.type}
              onClick={() => go(item as SearchResult)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/60 transition-colors",
                selected === i && "bg-muted/60",
              )}
              onMouseEnter={() => setSelected(i)}
            >
              <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                {iconFor(item.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{item.title}</div>
                {(item as SearchResult).subtitle && (
                  <div className="text-xs text-muted-foreground">{(item as SearchResult).subtitle}</div>
                )}
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-2 flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><kbd className="px-1 rounded border bg-muted">↑↓</kbd> navegar</span>
          <span className="flex items-center gap-1"><kbd className="px-1 rounded border bg-muted">Enter</kbd> abrir</span>
          <span className="flex items-center gap-1"><kbd className="px-1 rounded border bg-muted">Esc</kbd> fechar</span>
        </div>
      </div>
    </div>
  );
}
