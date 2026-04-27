import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  GripVertical, Plus, KanbanSquare, List as ListIcon, Search,
  X, Send, Trash2, Play, Square, Copy, Tag, Calendar, User,
  FolderKanban, AlertTriangle, Edit3, ExternalLink, Filter,
  MoreHorizontal, ChevronRight, MessageSquare, ClipboardCheck,
  Paperclip, Clock, ClipboardList, CheckCircle2, XCircle, CalendarDays, ChevronLeft,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { initials, formatDate, formatDateTime, isOverdue, formatBRL } from "@/lib/format";
import { STATUS_LABEL, STATUS_ORDER, PRIORITY_COLOR, PRIORITY_LABEL, STATUS_COLOR } from "@/lib/labels";
import { cn } from "@/lib/utils";
import {
  DndContext, type DragEndEvent, PointerSensor,
  useSensor, useSensors, useDroppable, useDraggable,
} from "@dnd-kit/core";
import { runAutomations } from "@/lib/automations";
import { useSound } from "@/lib/use-sound";
import { toast } from "sonner";
import { TaskAttachments, useTaskThumbnail } from "@/components/tasks/task-attachments";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import { TaskLinks } from "@/components/tasks/task-links";
import { TaskBodyImages } from "@/components/tasks/task-body-images";
import { TemplatePicker, type TaskTemplate } from "@/components/tasks/task-templates";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_app/tasks")({
  component: TasksPage,
});

type TaskStatus = "new" | "in_progress" | "in_review" | "done" | "deferred" | "waiting" | "awaiting_approval";
type TaskPriority = "low" | "medium" | "high" | "urgent";

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string | null;
  project_id: string | null;
  due_date: string | null;
  start_date: string | null;
  estimated_hours: number | null;
  tags: string[] | null;
  created_by: string | null;
  parent_task_id: string | null;
  position: number;
  task_type: "internal" | "external";
  service_value: number | null;
  completed_at: string | null;
  created_at: string;
  approved_by?: string | null;
  approved_at?: string | null;
  returned_at?: string | null;
  return_note?: string | null;
}

interface ProfileLite {
  id: string;
  full_name: string | null;
  contract_type?: "clt" | "pj" | null;
}

interface ProjectLite {
  id: string;
  name: string;
  color: string | null;
}

interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  position: number;
}

interface Comment {
  id: string;
  content: string;
  author_id: string | null;
  created_at: string;
}

interface TimeEntry {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
}

interface SubTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string | null;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function TasksPage() {
  const { user, profile, loading, isAuthenticated, isAdmin, isManagerOrAdmin, canCreateTasks } = useAuth();
  const { play: playSound } = useSound();
  const navigate = useNavigate();
  const [view, setView] = useState<"kanban" | "list" | "calendar">("kanban");
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [search, setSearch] = useState("");
  const [filterProject, setFilterProject] = useState("all");
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [panelTaskId, setPanelTaskId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // Create form

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    setPageLoading(true);
    const [t, p, pr] = await Promise.all([
      supabase.from("tasks").select("*").is("parent_task_id", null).order("position"),
      supabase.from("profiles").select("id,full_name,contract_type"),
      supabase.from("projects").select("id,name,color").eq("archived", false),
    ]);
    setTasks((t.data ?? []) as TaskRow[]);
    setProfiles((p.data ?? []) as ProfileLite[]);
    setProjects((pr.data ?? []) as ProjectLite[]);
    setPageLoading(false);
  }, [isAuthenticated]);

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) { setPageLoading(false); return; }
    void load();
  }, [loading, isAuthenticated, load]);

  const filtered = useMemo(() => tasks.filter((t) => {
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterProject !== "all" && t.project_id !== filterProject) return false;
    if (filterAssignee !== "all" && t.assignee_id !== filterAssignee) return false;
    if (filterPriority !== "all" && t.priority !== filterPriority) return false;
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    return true;
  }), [tasks, search, filterProject, filterAssignee, filterPriority, filterStatus]);

  const profileById = (id: string | null) => profiles.find((p) => p.id === id);
  const projectById = (id: string | null) => projects.find((p) => p.id === id);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const overdueCount = filtered.filter((t) => isOverdue(t.due_date) && t.status !== "done").length;
  const inProgressCount = filtered.filter((t) => t.status === "in_progress").length;
  const hasActiveFilter = filterProject !== "all" || filterAssignee !== "all" || filterPriority !== "all" || filterStatus !== "all";

  const quickStatusChange = async (taskId: string, newSt: TaskStatus) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const prevStatus = task.status;
    const update = { status: newSt, completed_at: newSt === "done" ? new Date().toISOString() : null };
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, ...update } : t));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from("tasks").update(update as any).eq("id", taskId);
    if (error) { toast.error(error.message); void load(); return; }
    if (user) {
      playSound(newSt === "done" ? "task_complete" : "status_change");
      if (newSt === "done") {
        // Only fire task_completed when done — avoids duplicate payment creation
        void runAutomations({ trigger: "task_completed", task: { ...task, ...update } as unknown as Record<string, unknown>, userId: user.id, userName: profile?.full_name ?? undefined });
      } else {
        // status_changed automation disabled — history already records changes
        // only task_completed is needed for payment automation
        void 0;
      }
    }
    toast.success(`→ ${STATUS_LABEL[newSt]}`);
  };

  const deleteTask = async (taskId: string) => {
    const { error } = await supabase.from("tasks").delete().eq("id", taskId);
    if (error) { toast.error(error.message); return; }
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    if (panelTaskId === taskId) setPanelTaskId(null);
    toast.success("Tarefa excluída.");
  };

  const onDragEnd = async (e: DragEndEvent) => {
    if (!e.over) return;
    const taskId = String(e.active.id);
    const newSt = String(e.over.id) as TaskStatus;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newSt) return;
    await quickStatusChange(taskId, newSt);
  };


  if (pageLoading || loading) {
    return (
      <div className="flex items-center justify-center p-16 text-muted-foreground">
        <div className="text-center space-y-3">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm">Carregando tarefas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Tarefas</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} tarefas · {inProgressCount} em andamento
            {overdueCount > 0 && <span className="text-rose-600"> · {overdueCount} atrasadas</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border bg-background p-0.5">
            <Button variant={view === "kanban" ? "secondary" : "ghost"} size="sm" onClick={() => setView("kanban")}>
              <KanbanSquare className="h-4 w-4 mr-1" /> Kanban
            </Button>
            <Button variant={view === "list" ? "secondary" : "ghost"} size="sm" onClick={() => setView("list")}>
              <ListIcon className="h-4 w-4 mr-1" /> Lista
            </Button>
            <Button variant={view === "calendar" ? "secondary" : "ghost"} size="sm" onClick={() => setView("calendar")}>
              <CalendarDays className="h-4 w-4 mr-1" /> Calendário
            </Button>
          </div>
          {canCreateTasks && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Nova tarefa
            </Button>
          )}
        </div>
      </div>

      {/* Search & Filter bar */}
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar tarefa..." className="pl-9 h-9" />
          {search && <button onClick={() => setSearch("")} className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
        </div>
        <Button
          variant="outline" size="sm"
          className={cn("h-9", showFilters && "border-primary text-primary")}
          onClick={() => setShowFilters((f) => !f)}
        >
          <Filter className="h-4 w-4 mr-1" />
          Filtros {hasActiveFilter && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-primary inline-block" />}
        </Button>
        {(hasActiveFilter || search) && (
          <Button variant="ghost" size="sm" className="h-9" onClick={() => { setFilterProject("all"); setFilterAssignee("all"); setFilterPriority("all"); setFilterStatus("all"); setSearch(""); }}>
            <X className="h-4 w-4 mr-1" /> Limpar
          </Button>
        )}
      </div>

      {showFilters && (
        <div className="flex flex-wrap gap-2 p-3 rounded-lg border bg-muted/20">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>{[["all", "Todos os status"], ...Object.entries(STATUS_LABEL)].map(([k, v]) => <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger className="w-[170px] h-8 text-xs"><SelectValue placeholder="Projeto" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Todos os projetos</SelectItem>
              {projects.map((p) => <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterAssignee} onValueChange={setFilterAssignee}>
            <SelectTrigger className="w-[170px] h-8 text-xs"><SelectValue placeholder="Responsável" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Todos</SelectItem>
              {profiles.map((p) => <SelectItem key={p.id} value={p.id} className="text-xs">{p.full_name ?? "—"}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Prioridade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Todas</SelectItem>
              {Object.entries(PRIORITY_LABEL).map(([k, v]) => <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Board + side panel */}
      <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 min-w-0 overflow-auto">
          {view === "kanban" ? (
            <DndContext sensors={sensors} onDragEnd={onDragEnd}>
              <div className="flex gap-2 pb-4 h-full w-full">
                {STATUS_ORDER.map((s) => (
                  <KanbanColumn
                    key={s}
                    status={s}
                    tasks={filtered.filter((t) => t.status === s)}
                    profileById={profileById}
                    projectById={projectById}
                    activePanelId={panelTaskId}
                    onOpenPanel={setPanelTaskId}
                    isManagerOrAdmin={isManagerOrAdmin}
                    onQuickStatus={quickStatusChange}
                    isAdmin={isAdmin}
                    onDelete={deleteTask}
                    userId={user?.id ?? null}
                    onInlineCreate={(task) => {
                      setTasks((prev) => [...prev, task]);
                      setPanelTaskId(task.id);
                    }}
                  />
                ))}
              </div>
            </DndContext>
          ) : view === "list" ? (
            <TaskListView
              tasks={filtered}
              profileById={profileById}
              projectById={projectById}
              activePanelId={panelTaskId}
              onOpenPanel={setPanelTaskId}
              onQuickStatus={quickStatusChange}
              onDelete={deleteTask}
              isManagerOrAdmin={isManagerOrAdmin}
              userId={user?.id ?? null}
              navigate={navigate}
            />
          ) : (
            <TaskCalendarView
              tasks={filtered}
              profileById={profileById}
              onOpenPanel={setPanelTaskId}
              isManagerOrAdmin={isManagerOrAdmin}
              onTaskUpdate={(updated) => setTasks((prev) => prev.map((t) => t.id === updated.id ? updated : t))}
            />
          )}
        </div>

        {/* Full-screen overlay — like Bitrix */}
        {panelTaskId && (
          <>
            <div className="fixed inset-0 z-50 flex flex-col bg-background">
              <TaskSidePanel
                key={panelTaskId}
                taskId={panelTaskId}
                onClose={() => setPanelTaskId(null)}
                profiles={profiles}
                projects={projects}
                user={user}
                authProfile={profile}
                isManagerOrAdmin={isManagerOrAdmin}
                onDelete={() => deleteTask(panelTaskId)}
                onTaskUpdate={(updated) => setTasks((prev) => prev.map((t) => t.id === updated.id ? updated : t))}
                navigate={navigate}
              />
            </div>
          </>
        )}
      </div>

      {/* Create modal */}
      <CreateTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projects={projects}
        profiles={profiles}
        onCreated={() => void load()}
      />

    </div>
  );
}

// ─── Kanban Column ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  new: "bg-slate-400",
  in_progress: "bg-blue-500",
  in_review: "bg-purple-500",
  done: "bg-emerald-500",
  deferred: "bg-neutral-400",
  waiting: "bg-amber-400",
  awaiting_approval: "bg-purple-500",
};

function KanbanColumn({
  status, tasks, profileById, projectById, activePanelId, onOpenPanel,
  isManagerOrAdmin, isAdmin, onQuickStatus, onDelete, userId, onInlineCreate,
}: {
  status: TaskStatus;
  tasks: TaskRow[];
  profileById: (id: string | null) => ProfileLite | undefined;
  projectById: (id: string | null) => ProjectLite | undefined;
  activePanelId: string | null;
  onOpenPanel: (id: string) => void;
  isManagerOrAdmin: boolean;
  isAdmin: boolean;
  onQuickStatus: (id: string, st: TaskStatus) => void;
  onDelete: (id: string) => void;
  userId: string | null;
  onInlineCreate: (task: TaskRow) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const [adding, setAdding] = useState(false);
  const [inlineTitle, setInlineTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (adding) setTimeout(() => inputRef.current?.focus(), 40); }, [adding]);

  const handleInline = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = inlineTitle.trim();
    if (!title || !userId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await supabase.from("tasks").insert([{
      title, status, priority: "medium", created_by: userId, position: tasks.length,
    }] as any).select().single();
    if (error) { toast.error(error.message); return; }
    onInlineCreate(data as TaskRow);
    setInlineTitle(""); setAdding(false);
  };

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-xl border bg-muted/20 flex flex-col min-w-[280px] flex-1",
        "max-h-[calc(100vh-200px)]",
        isOver && "ring-2 ring-primary bg-primary/5",
      )}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b bg-background/80 rounded-t-xl shrink-0">
        <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", STATUS_COLORS[status])} />
        <span className="text-sm font-semibold flex-1">{STATUS_LABEL[status]}</span>
        <span className="text-xs text-muted-foreground bg-muted rounded-full px-1.5 min-w-[20px] text-center">{tasks.length}</span>
        <button onClick={() => setAdding(true)} className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-muted" title="Adicionar">
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {tasks.map((t) => (
          <KanbanCard
            key={t.id}
            task={t}
            profileById={profileById}
            projectById={projectById}
            onOpenPanel={onOpenPanel}
            isActive={activePanelId === t.id}
            isManagerOrAdmin={isManagerOrAdmin}
            isAdmin={isAdmin}
            userId={userId}
            onQuickStatus={onQuickStatus}
            onDelete={onDelete}
          />
        ))}

        {adding && (
          <form onSubmit={handleInline} className="bg-background border rounded-lg p-2.5 shadow-sm space-y-2">
            <input
              ref={inputRef}
              value={inlineTitle}
              onChange={(e) => setInlineTitle(e.target.value)}
              placeholder="Título da tarefa..."
              className="w-full text-sm bg-transparent outline-none placeholder:text-muted-foreground"
              onKeyDown={(e) => e.key === "Escape" && (setAdding(false), setInlineTitle(""))}
            />
            <div className="flex gap-1">
              <Button type="submit" size="sm" className="h-6 text-xs px-2" disabled={!inlineTitle.trim()}>Adicionar</Button>
              <Button type="button" size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => { setAdding(false); setInlineTitle(""); }}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Kanban Card ───────────────────────────────────────────────────────────────

function KanbanCard({
  task, profileById, projectById, onOpenPanel, isActive,
  isManagerOrAdmin, isAdmin, userId, onQuickStatus, onDelete,
}: {
  task: TaskRow;
  profileById: (id: string | null) => ProfileLite | undefined;
  projectById: (id: string | null) => ProjectLite | undefined;
  onOpenPanel: (id: string) => void;
  isActive: boolean;
  isManagerOrAdmin: boolean;
  isAdmin: boolean;
  userId: string | null;
  onQuickStatus: (id: string, st: TaskStatus) => void;
  onDelete: (id: string) => void;
}) {
  const canDeleteCard = isAdmin || userId === task.created_by;
  const cardNavigate = useNavigate();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const proj = projectById(task.project_id);
  const assignee = profileById(task.assignee_id);
  const overdue = isOverdue(task.due_date) && task.status !== "done";
  const style = transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` } : undefined;
  const thumbnail = useTaskThumbnail(task.id);

  const priorityStripe: Record<TaskPriority, string> = {
    low: "bg-slate-300",
    medium: "bg-blue-400",
    high: "bg-amber-400",
    urgent: "bg-rose-500",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-lg border bg-card shadow-sm cursor-pointer select-none group transition-all",
        isDragging && "opacity-40 scale-105 shadow-xl",
        isActive && "ring-2 ring-primary shadow-md",
        !isActive && "hover:shadow-md hover:border-primary/40",
      )}
    >
      {/* Priority stripe */}
      <div className={cn("h-0.5 rounded-t-lg", priorityStripe[task.priority])} />

      {/* Thumbnail */}
      {thumbnail && (
        <div className="w-full overflow-hidden bg-muted rounded-t-lg" style={{ height: "160px" }}>
          <img
            src={thumbnail}
            alt="preview"
            className="w-full h-full object-cover"
            onClick={() => onOpenPanel(task.id)}
          />
        </div>
      )}

      <div className="p-3" onClick={() => onOpenPanel(task.id)}>
        <div className="flex items-start gap-1.5">
          <div className="flex-1 text-sm font-medium leading-snug line-clamp-2 min-w-0">{task.title}</div>
          {/* Drag + menu */}
          <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
            <button {...listeners} {...attributes} aria-label="Arrastar" className="p-0.5 text-muted-foreground cursor-grab active:cursor-grabbing rounded hover:bg-muted">
              <GripVertical className="h-3.5 w-3.5" />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-0.5 text-muted-foreground rounded hover:bg-muted">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => onOpenPanel(task.id)}>
                  <Edit3 className="h-3.5 w-3.5 mr-2" /> Abrir painel
                </DropdownMenuItem>
                {(isManagerOrAdmin || userId === task.created_by) && (
                  <DropdownMenuItem onClick={() => cardNavigate({ to: "/tasks/$taskId", params: { taskId: task.id } })}>
                    <Edit3 className="h-3.5 w-3.5 mr-2" /> Editar tarefa
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <div className="px-2 py-1 text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Mover para</div>
                {STATUS_ORDER.filter((s) => s !== task.status).map((s) => (
                  <DropdownMenuItem key={s} onClick={() => onQuickStatus(task.id, s)}>
                    <ChevronRight className="h-3.5 w-3.5 mr-2" /> {STATUS_LABEL[s]}
                  </DropdownMenuItem>
                ))}
                {canDeleteCard && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(task.id)}>
                      <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Project */}
        {proj && (
          <div className="flex items-center gap-1 mt-1.5 text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: proj.color ?? "#3b82f6" }} />
            <span className="truncate">{proj.name}</span>
          </div>
        )}

        {/* Tags */}
        {task.tags && task.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {task.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="text-[10px] bg-primary/10 text-primary rounded px-1.5 py-0.5">{tag}</span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Badge className={cn("text-[10px] px-1.5 py-0 h-4", PRIORITY_COLOR[task.priority])}>
              {PRIORITY_LABEL[task.priority]}
            </Badge>
            {task.task_type === "external" && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-emerald-300 text-emerald-700">PJ</Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {task.due_date && (
              <span className={cn("text-[10px]", overdue ? "text-rose-600 font-medium" : "text-muted-foreground")}>
                {overdue && <AlertTriangle className="h-2.5 w-2.5 inline mr-0.5" />}
                {formatDate(task.due_date)}
              </span>
            )}
            {assignee && (
              <Avatar className="h-5 w-5"><AvatarFallback className="text-[9px]">{initials(assignee.full_name)}</AvatarFallback></Avatar>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── List View ─────────────────────────────────────────────────────────────────

function TaskListView({
  tasks, profileById, projectById, activePanelId, onOpenPanel,
  onQuickStatus, onDelete, isManagerOrAdmin, userId, navigate,
}: {
  tasks: TaskRow[];
  profileById: (id: string | null) => ProfileLite | undefined;
  projectById: (id: string | null) => ProjectLite | undefined;
  activePanelId: string | null;
  onOpenPanel: (id: string) => void;
  onQuickStatus: (id: string, st: TaskStatus) => void;
  onDelete: (id: string) => void;
  isManagerOrAdmin: boolean;
  userId: string | null;
  navigate: ReturnType<typeof useNavigate>;
}) {
  return (
    <div className="rounded-xl border bg-background overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/30">
          <tr>
            <th className="p-3 text-left font-medium text-muted-foreground">Tarefa</th>
            <th className="p-3 text-left font-medium text-muted-foreground">Status</th>
            <th className="p-3 text-left font-medium text-muted-foreground">Prioridade</th>
            <th className="p-3 text-left font-medium text-muted-foreground">Responsável</th>
            <th className="p-3 text-left font-medium text-muted-foreground">Prazo</th>
            <th className="p-3 text-left font-medium text-muted-foreground">Projeto</th>
            <th className="p-3 w-12" />
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => {
            const proj = projectById(t.project_id);
            const assignee = profileById(t.assignee_id);
            const overdue = isOverdue(t.due_date) && t.status !== "done";
            return (
              <tr
                key={t.id}
                onClick={() => onOpenPanel(t.id)}
                className={cn(
                  "border-t cursor-pointer hover:bg-muted/20 transition-colors",
                  activePanelId === t.id && "bg-primary/5 border-l-2 border-l-primary",
                )}
              >
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <div className={cn("h-4 w-1 rounded-full shrink-0", {
                      "bg-slate-300": t.priority === "low",
                      "bg-blue-400": t.priority === "medium",
                      "bg-amber-400": t.priority === "high",
                      "bg-rose-500": t.priority === "urgent",
                    })} />
                    <div className="min-w-0">
                      <div className="font-medium truncate max-w-xs">{t.title}</div>
                      {t.tags && t.tags.length > 0 && (
                        <div className="flex gap-1 mt-0.5">
                          {t.tags.slice(0, 2).map((tag) => (
                            <span key={tag} className="text-[10px] bg-primary/10 text-primary rounded px-1">{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="p-3">
                  <Badge variant="outline" className={cn("text-xs", STATUS_COLOR[t.status])}>{STATUS_LABEL[t.status]}</Badge>
                </td>
                <td className="p-3">
                  <Badge className={cn("text-xs", PRIORITY_COLOR[t.priority])}>{PRIORITY_LABEL[t.priority]}</Badge>
                </td>
                <td className="p-3">
                  {assignee ? (
                    <div className="flex items-center gap-1.5">
                      <Avatar className="h-5 w-5"><AvatarFallback className="text-[9px]">{initials(assignee.full_name)}</AvatarFallback></Avatar>
                      <span className="text-xs truncate max-w-[100px]">{assignee.full_name}</span>
                    </div>
                  ) : <span className="text-muted-foreground text-xs">—</span>}
                </td>
                <td className={cn("p-3 text-xs", overdue ? "text-rose-600 font-medium" : "text-muted-foreground")}>
                  {overdue && <AlertTriangle className="h-3 w-3 inline mr-1" />}
                  {formatDate(t.due_date)}
                </td>
                <td className="p-3">
                  {proj ? (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span className="h-2 w-2 rounded-full" style={{ background: proj.color ?? "#3b82f6" }} />
                      <span className="truncate max-w-[110px]">{proj.name}</span>
                    </span>
                  ) : <span className="text-muted-foreground text-xs">—</span>}
                </td>
                <td className="p-3" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => onOpenPanel(t.id)}><Edit3 className="h-3.5 w-3.5 mr-2" /> Ver painel</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate({ to: "/tasks/$taskId", params: { taskId: t.id } })}><ExternalLink className="h-3.5 w-3.5 mr-2" /> Página completa</DropdownMenuItem>
                      {(isManagerOrAdmin || userId === t.created_by) && (
                        <DropdownMenuItem onClick={() => navigate({ to: "/tasks/$taskId", params: { taskId: t.id } })}>
                          <Edit3 className="h-3.5 w-3.5 mr-2" /> Editar tarefa
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <div className="px-2 py-1 text-[10px] text-muted-foreground font-medium uppercase">Mover para</div>
                      {STATUS_ORDER.filter((s) => s !== t.status).map((s) => (
                        <DropdownMenuItem key={s} onClick={() => onQuickStatus(t.id, s)}><ChevronRight className="h-3.5 w-3.5 mr-2" /> {STATUS_LABEL[s]}</DropdownMenuItem>
                      ))}
                      {isManagerOrAdmin && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(t.id)}><Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir</DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            );
          })}
          {tasks.length === 0 && (
            <tr><td colSpan={7} className="py-12 text-center text-muted-foreground text-sm">Nenhuma tarefa encontrada.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}


// ─── Calendar View ────────────────────────────────────────────────────────────

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const PRIORITY_STRIPE: Record<TaskPriority, string> = {
  low: "bg-slate-200 text-slate-700",
  medium: "bg-blue-100 text-blue-800",
  high: "bg-amber-100 text-amber-800",
  urgent: "bg-rose-100 text-rose-800",
};

function TaskCalendarView({
  tasks, profileById, onOpenPanel, isManagerOrAdmin, onTaskUpdate,
}: {
  tasks: TaskRow[];
  profileById: (id: string | null) => ProfileLite | undefined;
  onOpenPanel: (id: string) => void;
  isManagerOrAdmin: boolean;
  onTaskUpdate: (t: TaskRow) => void;
}) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const tasksByDay = (day: number) =>
    tasks.filter((t) => t.due_date && new Date(t.due_date).getDate() === day
      && new Date(t.due_date).getMonth() === month
      && new Date(t.due_date).getFullYear() === year);

  const handleDrop = async (day: number) => {
    if (!draggingId || !isManagerOrAdmin) return;
    const date = new Date(year, month, day, 12, 0, 0);
    const { data, error } = await supabase.from("tasks").update({ due_date: date.toISOString() }).eq("id", draggingId).select().single();
    if (error) { toast.error(error.message); return; }
    onTaskUpdate(data as TaskRow);
    toast.success("Prazo atualizado!");
    setDraggingId(null);
  };

  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const overdue = (t: TaskRow, day: number) =>
    t.status !== "done" && new Date(year, month, day) < today && !isToday(day);

  const selectedTasks = selectedDay ? tasksByDay(selectedDay) : [];
  const tasksWithDueDate = tasks.filter((t) => t.due_date).length;

  return (
    <div className="flex gap-4 h-full min-h-0">
      {/* Calendar grid */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-3 shrink-0">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={prevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold min-w-[160px] text-center">
              {MONTHS[month]} {year}
            </span>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={nextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }}>
            Hoje
          </Button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 shrink-0">
          {WEEKDAYS.map((d) => (
            <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1.5">
              {d}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-px bg-border rounded-xl overflow-hidden flex-1 min-h-0">
          {cells.map((day, i) => {
            const dayTasks = day ? tasksByDay(day) : [];
            const isSelected = day === selectedDay;
            return (
              <div
                key={i}
                onDragOver={(e) => day && e.preventDefault()}
                onDrop={() => day && void handleDrop(day)}
                onClick={() => day && setSelectedDay(day === selectedDay ? null : day)}
                className={cn(
                  "bg-background p-1 min-h-[80px] cursor-pointer transition-colors overflow-hidden",
                  !day && "bg-muted/20 cursor-default",
                  day && "hover:bg-muted/20",
                  isSelected && "ring-2 ring-primary ring-inset bg-primary/5",
                )}
              >
                {day && (
                  <>
                    <div className={cn(
                      "h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium mb-1",
                      isToday(day) ? "bg-primary text-primary-foreground" : "text-foreground",
                    )}>
                      {day}
                    </div>
                    <div className="space-y-0.5">
                      {dayTasks.slice(0, 3).map((t) => (
                        <div
                          key={t.id}
                          draggable={isManagerOrAdmin}
                          onDragStart={(e) => { e.stopPropagation(); setDraggingId(t.id); }}
                          onDragEnd={() => setDraggingId(null)}
                          onClick={(e) => { e.stopPropagation(); onOpenPanel(t.id); }}
                          className={cn(
                            "text-[10px] rounded px-1 py-0.5 truncate cursor-pointer hover:opacity-80 transition-opacity",
                            PRIORITY_STRIPE[t.priority],
                            overdue(t, day) && "ring-1 ring-rose-400",
                            draggingId === t.id && "opacity-40",
                          )}
                          title={t.title}
                        >
                          {overdue(t, day) && "⚠ "}{t.title}
                        </div>
                      ))}
                      {dayTasks.length > 3 && (
                        <div className="text-[10px] text-muted-foreground px-1 font-medium">
                          +{dayTasks.length - 3} mais
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {tasksWithDueDate === 0 && (
          <div className="text-center text-sm text-muted-foreground mt-4">
            <CalendarDays className="h-6 w-6 mx-auto mb-1 opacity-30" />
            Nenhuma tarefa tem prazo definido neste mês.
          </div>
        )}
      </div>

      {/* Day detail sidebar */}
      {selectedDay && (
        <div className="w-64 shrink-0 border rounded-xl bg-background flex flex-col overflow-hidden">
          <div className="p-3 border-b bg-muted/10 shrink-0">
            <div className="font-semibold text-sm">
              {selectedDay} de {MONTHS[month]}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {selectedTasks.length === 0 ? "Nenhuma tarefa" : `${selectedTasks.length} tarefa${selectedTasks.length > 1 ? "s" : ""} com prazo`}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {selectedTasks.length === 0 && (
              <div className="text-center py-6 text-muted-foreground text-xs">
                Clique em outro dia.
              </div>
            )}
            {selectedTasks.map((t) => {
              const assignee = profileById(t.assignee_id);
              const isOvd = overdue(t, selectedDay);
              return (
                <button
                  key={t.id}
                  onClick={() => onOpenPanel(t.id)}
                  className="w-full text-left rounded-lg border bg-card p-2.5 hover:border-primary/40 transition-colors"
                >
                  <div className="text-xs font-medium leading-snug mb-1.5">{t.title}</div>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline" className={cn("text-[10px] px-1 h-4", STATUS_COLOR[t.status])}>
                      {STATUS_LABEL[t.status]}
                    </Badge>
                    <Badge className={cn("text-[10px] px-1 h-4", PRIORITY_COLOR[t.priority])}>
                      {PRIORITY_LABEL[t.priority]}
                    </Badge>
                  </div>
                  {assignee && (
                    <div className="flex items-center gap-1 mt-1.5">
                      <Avatar className="h-4 w-4"><AvatarFallback className="text-[8px]">{initials(assignee.full_name)}</AvatarFallback></Avatar>
                      <span className="text-[11px] text-muted-foreground truncate">{assignee.full_name}</span>
                    </div>
                  )}
                  {isOvd && (
                    <div className="text-[11px] text-rose-600 font-medium mt-1 flex items-center gap-0.5">
                      <AlertTriangle className="h-3 w-3" /> Atrasada
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Image Thumbnails (para o painel de tarefa) ──────────────────────────────

function ImageThumbnails({ taskId }: { taskId: string }) {
  const [images, setImages] = useState<Array<{ id: string; storage_path: string; file_name: string; signed_url?: string }>>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("attachments").select("id,storage_path,file_name,mime_type")
      .eq("task_id", taskId).like("mime_type", "image/%")
      .order("created_at").then(async ({ data }) => {
        if (!data || data.length === 0) return;
        const withUrls = await Promise.all((data as Array<{ id: string; storage_path: string; file_name: string }>).map(async (img) => {
          const { data: s } = await supabase.storage.from("attachments").createSignedUrl(img.storage_path, 3600 * 8);
          return { ...img, signed_url: s?.signedUrl };
        }));
        setImages(withUrls.filter((img) => img.signed_url));
      });
  }, [taskId]);

  if (images.length === 0) return null;

  return (
    <div>
      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Imagens ({images.length})
      </div>
      <div className="grid grid-cols-2 gap-2">
        {images.map((img) => (
          <div key={img.id} className="relative group rounded-xl overflow-hidden bg-muted cursor-pointer aspect-video"
            onClick={() => setExpanded(expanded === img.id ? null : img.id)}>
            <img src={img.signed_url} alt={img.file_name} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
              <ExternalLink className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        ))}
      </div>
      {/* Expanded preview */}
      {expanded && (
        <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setExpanded(null)}>
          <img
            src={images.find((i) => i.id === expanded)?.signed_url}
            alt="preview"
            className="max-w-full max-h-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button onClick={() => setExpanded(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white">
            <X className="h-6 w-6" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Side Panel (tela cheia estilo Bitrix) ────────────────────────────────────

function TaskSidePanel({
  taskId, onClose, profiles, projects, user, authProfile,
  isManagerOrAdmin, onDelete, onTaskUpdate, navigate,
}: {
  taskId: string;
  onClose: () => void;
  profiles: ProfileLite[];
  projects: ProjectLite[];
  user: { id: string } | null;
  authProfile: { full_name: string | null } | null;
  isManagerOrAdmin: boolean;
  onDelete: () => void;
  onTaskUpdate: (t: TaskRow) => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const { isAdmin } = useAuth();
  const { play: playSound } = useSound();
  const [task, setTask] = useState<TaskRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [subtasks, setSubtasks] = useState<SubTask[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [newComment, setNewComment] = useState("");
  const [newChecklist, setNewChecklist] = useState("");
  const [activeTimer, setActiveTimer] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<"chat" | "checklist" | "files" | "time">("chat");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [history, setHistory] = useState<Array<{ id: string; action: string; field: string | null; old_value: string | null; new_value: string | null; user_id: string | null; created_at: string }>>([]);
  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);

  const loadPanel = useCallback(async () => {
    setLoading(true);
    const [t, sub, comm, ch, te, hist] = await Promise.all([
      supabase.from("tasks").select("*").eq("id", taskId).maybeSingle(),
      supabase.from("tasks").select("id,title,status,priority,assignee_id").eq("parent_task_id", taskId),
      supabase.from("comments").select("*").eq("task_id", taskId).order("created_at"),
      supabase.from("checklists").select("*").eq("task_id", taskId).order("position"),
      supabase.from("time_entries").select("*").eq("task_id", taskId).order("started_at", { ascending: false }),
      supabase.from("task_history" as never).select("*").eq("task_id" as never, taskId as never).order("created_at" as never),
    ]);
    if (t.data) { setTask(t.data as TaskRow); onTaskUpdate(t.data as TaskRow); }
    setSubtasks((sub.data ?? []) as SubTask[]);
    setComments((comm.data ?? []) as Comment[]);
    setChecklist((ch.data ?? []) as ChecklistItem[]);
    setTimeEntries((te.data ?? []) as TimeEntry[]);
    setHistory((hist.data ?? []) as unknown as typeof history);
    const open = (te.data ?? []).find((x) => (x as TimeEntry).user_id === user?.id && !(x as TimeEntry).ended_at);
    setActiveTimer(open ? (open as TimeEntry).id : null);
    setLoading(false);
  }, [taskId, user?.id]);

  useEffect(() => { void loadPanel(); }, [loadPanel]);

  // Realtime comments
  useEffect(() => {
    const channel = supabase.channel(`task_comments_${taskId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "comments", filter: `task_id=eq.${taskId}` }, (payload) => {
        const newMsg = payload.new as Comment;
        setComments((prev) => [...prev, newMsg]);
        if (newMsg.author_id !== user?.id) playSound("new_comment");
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [taskId, user?.id]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  const update = async (patch: Partial<TaskRow>) => {
    if (!task || !user) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await supabase.from("tasks").update(patch as any).eq("id", task.id).select().single();
    if (error) { toast.error(error.message); return; }
    const updated = data as TaskRow;
    setTask(updated);
    onTaskUpdate(updated);
    // Record history
    const entries: Array<{ task_id: string; user_id: string; action: string; field: string; old_value: string | null; new_value: string | null }> = [];
    if ("status" in patch && patch.status !== task.status)
      entries.push({ task_id: task.id, user_id: user.id, action: "status_changed", field: "status", old_value: task.status, new_value: patch.status as string });
    if (entries.length > 0) {
      const { data: nh } = await supabase.from("task_history" as never).insert(entries as never).select();
      if (nh) setHistory((h) => [...h, ...(nh as unknown as typeof history)]);
    }
  };

  const profileById = (id: string | null) => profiles.find((p) => p.id === id);
  const canDelete = isAdmin || user?.id === task?.created_by; // admin ou proprietário
  const isAssignee = user?.id === task?.assignee_id;
  const totalMin = timeEntries.reduce((s, t) => s + (t.duration_minutes ?? 0), 0);
  const checklistDone = checklist.filter((c) => c.done).length;

  const sendComment = async () => {
    if (!user || !newComment.trim() || !task) return;
    const content = newComment.trim();
    setNewComment("");
    const { error } = await supabase.from("comments").insert([{ task_id: task.id, author_id: user.id, content }]);
    if (error) { toast.error(error.message); setNewComment(content); return; }
    void runAutomations({ trigger: "comment_added", task: task as unknown as Record<string, unknown>, comment: { content, author_id: user.id }, userId: user.id, userName: authProfile?.full_name ?? undefined });
  };

  const insertMention = (name: string) => {
    const lastAt = newComment.lastIndexOf("@");
    setNewComment(newComment.slice(0, lastAt + 1) + name + " ");
    setMentionSearch(null);
    commentRef.current?.focus();
  };

  const mentionResults = mentionSearch !== null
    ? profiles.filter((p) => p.full_name?.toLowerCase().includes(mentionSearch)).slice(0, 5)
    : [];

  const startTimer = async () => {
    if (!user) return;
    const { data, error } = await supabase.from("time_entries").insert([{ task_id: taskId, user_id: user.id, started_at: new Date().toISOString() }]).select().single();
    if (error) { toast.error(error.message); return; }
    setActiveTimer((data as TimeEntry).id);
    setTimeEntries((t) => [data as TimeEntry, ...t]);
  };

  const stopTimer = async () => {
    if (!activeTimer) return;
    const entry = timeEntries.find((t) => t.id === activeTimer);
    if (!entry) return;
    const ended = new Date();
    const minutes = Math.round((ended.getTime() - new Date(entry.started_at).getTime()) / 60000);
    await supabase.from("time_entries").update({ ended_at: ended.toISOString(), duration_minutes: minutes }).eq("id", activeTimer);
    setActiveTimer(null);
    void loadPanel();
    toast.success(`Timer: ${minutes}m registrado`);
  };

  const renderComment = (content: string) => content.split(/(@\S+)/g).map((part, i) => {
    if (part.startsWith("@")) {
      const found = profiles.find((p) => p.full_name?.toLowerCase() === part.slice(1).toLowerCase());
      if (found) return <span key={i} className="text-primary font-medium bg-primary/10 rounded px-0.5">{part}</span>;
    }
    return <span key={i}>{part}</span>;
  });

  // Merged timeline
  type TItem = { kind: "comment"; data: Comment } | { kind: "event"; data: typeof history[number] };
  const timeline: TItem[] = [
    ...comments.map((m) => ({ kind: "comment" as const, data: m })),
    ...history.map((h) => ({ kind: "event" as const, data: h })),
  ].sort((a, b) => new Date(a.data.created_at).getTime() - new Date(b.data.created_at).getTime());

  const groupedTimeline: { date: string; items: TItem[] }[] = [];
  for (const item of timeline) {
    const d = new Date(item.data.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
    const last = groupedTimeline[groupedTimeline.length - 1];
    if (last?.date === d) last.items.push(item);
    else groupedTimeline.push({ date: d, items: [item] });
  }

  const historyLabel = (h: typeof history[number]) => {
    const actor = profileById(h.user_id)?.full_name ?? "Alguém";
    if (h.action === "status_changed") return `${actor} mudou o status: ${STATUS_LABEL[h.old_value ?? ""] ?? h.old_value} → ${STATUS_LABEL[h.new_value ?? ""] ?? h.new_value}`;
    if (h.action === "assigned") return `${actor} atribuiu a tarefa para ${profileById(h.new_value)?.full_name ?? "alguém"}`;
    if (h.action === "due_changed") return `${actor} alterou o prazo`;
    return `${actor} atualizou a tarefa`;
  };

  if (loading) return (
    <div className="fixed inset-0 z-50 bg-background flex items-center justify-center">
      <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!task) return null;

  const assignee = profileById(task.assignee_id);
  const creator = profileById(task.created_by);
  const proj = projects.find((p) => p.id === task.project_id);

  const showStart   = task.status === "new"         && isAssignee;
  const showSend    = task.status === "in_progress" && isAssignee;
  const showWait    = task.status === "in_review"   && isAssignee && !isManagerOrAdmin;
  const showApprove = task.status === "in_review"   && user?.id === task.created_by;
  const showDone    = task.status === "done";
  const hasFooter   = showStart || showSend || showWait || showApprove || showDone;

  const rightTabs = [
    { id: "chat", label: `Bate-papo${comments.length ? ` (${comments.length})` : ""}`, icon: MessageSquare },
    { id: "checklist", label: `Checklist${checklist.length ? ` ${checklistDone}/${checklist.length}` : ""}`, icon: ClipboardCheck },
    { id: "files", label: "Arquivos", icon: Paperclip },
    { id: "time", label: totalMin > 0 ? `Tempo ${Math.floor(totalMin/60)}h${totalMin%60}m` : "Tempo", icon: Clock },
  ] as const;

  return (
    <div className="flex flex-col h-screen w-screen bg-background overflow-hidden">

      {/* ── Top bar ───────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-3 border-b bg-background shrink-0">
        <button onClick={onClose} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Fechar">
          <X className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold truncate">{task.title}</h1>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {/* Step progress */}
            {(["new","in_progress","in_review","done"] as const).map((s, i) => {
              const steps = ["new","in_progress","in_review","done"];
              const curIdx = steps.indexOf(task.status === "deferred" ? "deferred" : ["waiting","awaiting_approval"].includes(task.status) ? "in_review" : task.status);
              const sIdx = steps.indexOf(s);
              return (
                <div key={s} className="flex items-center gap-1">
                  <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium",
                    sIdx === curIdx ? "bg-primary text-primary-foreground" :
                    sIdx < curIdx ? "bg-emerald-100 text-emerald-700" :
                    "bg-muted text-muted-foreground"
                  )}>
                    {sIdx < curIdx ? "✓ " : ""}{STATUS_LABEL[s]}
                  </span>
                  {i < 3 && <div className="h-px w-4 bg-border" />}
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {activeTimer ? (
            <button onClick={stopTimer} className="flex items-center gap-1.5 text-xs bg-rose-100 text-rose-700 rounded-md px-3 py-1.5 hover:bg-rose-200 font-medium">
              <Square className="h-3.5 w-3.5" /> Parar timer
            </button>
          ) : (
            <button onClick={startTimer} className="flex items-center gap-1.5 text-xs border rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted font-medium">
              <Play className="h-3.5 w-3.5" /> Timer
            </button>
          )}
          {canDelete && (
            <button onClick={() => setDeleteOpen(true)} className="p-1.5 rounded hover:bg-rose-50 text-muted-foreground hover:text-rose-600" title="Excluir">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT — info da tarefa + imagens (50%) */}
        <div className="w-1/2 border-r flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 space-y-5">

            {/* Descrição */}
            {task.description && (
              <div className="rounded-xl bg-muted/30 p-4">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">O que fazer</div>
                <div className="text-sm leading-relaxed whitespace-pre-wrap">
                  {task.description.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
                    /^https?:\/\//.test(part)
                      ? <a key={i} href={part} target="_blank" rel="noreferrer" className="text-primary underline break-all">{part}</a>
                      : <span key={i}>{part}</span>
                  )}
                </div>
              </div>
            )}

            {/* Meta info grid */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground text-xs">Proprietário</span>
                <div className="flex items-center gap-1.5">
                  <Avatar className="h-5 w-5"><AvatarFallback className="text-[9px]">{initials(creator?.full_name)}</AvatarFallback></Avatar>
                  <span className="text-xs font-medium">{creator?.full_name ?? "—"}</span>
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground text-xs">Responsável</span>
                <div className="flex items-center gap-1.5">
                  <Avatar className="h-5 w-5"><AvatarFallback className="text-[9px]">{initials(assignee?.full_name)}</AvatarFallback></Avatar>
                  <span className="text-xs font-medium">{assignee?.full_name ?? "—"}</span>
                </div>
              </div>
              {task.due_date && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground text-xs flex items-center gap-1"><Calendar className="h-3 w-3" /> Prazo</span>
                  <span className={cn("text-xs font-semibold", isOverdue(task.due_date) && task.status !== "done" ? "text-rose-600" : "")}>
                    {isOverdue(task.due_date) && task.status !== "done" && <AlertTriangle className="h-3 w-3 inline mr-0.5" />}
                    {formatDate(task.due_date)}
                  </span>
                </div>
              )}
              {proj && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground text-xs flex items-center gap-1"><FolderKanban className="h-3 w-3" /> Projeto</span>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: proj.color ?? "#3b82f6" }} />
                    <span className="text-xs font-medium truncate max-w-[160px]">{proj.name}</span>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground text-xs">Status</span>
                <Badge variant="outline" className={cn("text-xs", STATUS_COLOR[task.status])}>{STATUS_LABEL[task.status]}</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground text-xs">Prioridade</span>
                <Badge className={cn("text-xs", PRIORITY_COLOR[task.priority])}>{PRIORITY_LABEL[task.priority]}</Badge>
              </div>
              {task.task_type === "external" && task.service_value && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground text-xs">Valor PJ</span>
                  <span className="text-xs font-semibold text-emerald-700">{formatBRL(task.service_value)}</span>
                </div>
              )}
              {task.estimated_hours && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground text-xs flex items-center gap-1"><Clock className="h-3 w-3" /> Horas est.</span>
                  <span className="text-xs font-medium">{task.estimated_hours}h</span>
                </div>
              )}
            </div>

            {/* Imagens anexadas */}
            <ImageThumbnails taskId={taskId} />

            {/* Tags */}
            {(task.tags ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {(task.tags ?? []).map((tag) => (
                  <span key={tag} className="text-[11px] bg-primary/10 text-primary rounded-full px-2.5 py-1">{tag}</span>
                ))}
              </div>
            )}

            {/* Subtarefas */}
            {subtasks.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Subtarefas ({subtasks.length})</div>
                {subtasks.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 py-1.5 border-b last:border-0">
                    <div className={cn("h-2 w-2 rounded-full shrink-0", s.status === "done" ? "bg-emerald-500" : "bg-slate-400")} />
                    <span className={cn("text-sm flex-1", s.status === "done" && "line-through text-muted-foreground")}>{s.title}</span>
                    <Badge variant="outline" className="text-[9px] px-1 h-4">{STATUS_LABEL[s.status]}</Badge>
                  </div>
                ))}
              </div>
            )}

            {/* Links */}
            <div>
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <ExternalLink className="h-3 w-3" /> Links
              </div>
              <TaskLinks taskId={taskId} canEdit={isManagerOrAdmin} />
            </div>

            {/* ID/Data */}
            <div className="text-[10px] text-muted-foreground pt-2 border-t">
              ID: {task.id.slice(0, 8).toUpperCase()} · Criada em {formatDateTime(task.created_at)}
              {task.completed_at && ` · Concluída ${formatDateTime(task.completed_at)}`}
            </div>
          </div>

          {/* ── Rodapé com botões de ação ── */}
          {hasFooter && (
            <div className="border-t bg-background p-4 shrink-0 space-y-2">
              {showStart && (
                <button onClick={() => void update({ status: "in_progress" as TaskStatus })}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 font-semibold text-sm shadow-sm transition-all active:scale-95">
                  <Play className="h-4 w-4" /> Iniciar esta tarefa
                </button>
              )}
              {showSend && (
                <button onClick={() => void update({ status: "in_review" as TaskStatus })}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-purple-600 text-white hover:bg-purple-700 font-semibold text-sm shadow-sm transition-all active:scale-95">
                  <CheckCircle2 className="h-4 w-4" /> Concluí — enviar para revisão
                </button>
              )}
              {showWait && (
                <div className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 font-medium text-sm">
                  <Clock className="h-4 w-4" /> Aguardando aprovação do gestor
                </div>
              )}
              {showApprove && (
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      await update({ status: "done" as TaskStatus, approved_by: user?.id ?? null, approved_at: new Date().toISOString(), completed_at: new Date().toISOString() });
                      if (task.task_type === "external" && task.assignee_id) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const { data: ex } = await (supabase.from("payments") as any).select("id").eq("task_id", task.id).eq("status", "pending").maybeSingle();
                        if (!ex) {
                          const amount = task.service_value ?? 0;
                          await supabase.from("payments").insert([{ description: `Pagamento ref. tarefa: ${task.title}`, amount, beneficiary_user_id: task.assignee_id, status: "pending", due_date: new Date(Date.now() + 5*86400000).toISOString().slice(0,10), task_id: task.id, project_id: task.project_id, created_by: user?.id ?? null }]);
                          if (amount === 0) {
                            toast.success("✅ Aprovada! Pagamento registrado — edite o valor no módulo Pagamentos.");
                          } else {
                            toast.success(`✅ Aprovada! Pagamento de ${amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} registrado para o PJ.`);
                          }
                        } else { toast.success("✅ Tarefa aprovada! Pagamento já existia."); }
                      } else { toast.success("✅ Tarefa aprovada e concluída!"); }
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 font-semibold text-sm transition-all active:scale-95">
                    <CheckCircle2 className="h-4 w-4" /> Aprovar e concluir
                  </button>
                  <button
                    onClick={async () => {
                      const note = window.prompt("Motivo da devolução (opcional):");
                      await update({ status: "in_progress" as TaskStatus, returned_at: new Date().toISOString(), return_note: note ?? null });
                      toast.success("Devolvida para edição.");
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-rose-100 text-rose-700 hover:bg-rose-200 font-semibold text-sm transition-all active:scale-95">
                    <XCircle className="h-4 w-4" /> Devolver para edição
                  </button>
                </div>
              )}
              {showDone && (
                <div className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold text-sm">
                  <CheckCircle2 className="h-4 w-4" /> Tarefa concluída ✓
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT — Abas: chat, checklist, arquivos, tempo */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tab bar — só chat e checklist */}
          <div className="flex border-b bg-background shrink-0 px-4">
            {([
              { id: "chat" as const, label: comments.length ? `Bate-papo (${comments.length})` : "Bate-papo", icon: MessageSquare },
              { id: "checklist" as const, label: checklist.length ? `Checklist ${checklistDone}/${checklist.length}` : "Checklist", icon: ClipboardCheck },
            ]).map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setRightTab(id as typeof rightTab)}
                className={cn("flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  rightTab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                )}>
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          {/* Chat */}
          {rightTab === "chat" && (
            <div className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1">
                {timeline.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <MessageSquare className="h-12 w-12 mb-3 opacity-20" />
                    <p className="text-sm">Nenhuma mensagem ainda.</p>
                    <p className="text-xs">Comece a conversa sobre esta tarefa.</p>
                  </div>
                )}
                {groupedTimeline.map(({ date, items }) => (
                  <div key={date}>
                    <div className="flex items-center gap-2 my-4">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-[11px] text-muted-foreground px-2">{date}</span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                    {items.map((item, idx) => {
                      if (item.kind === "event") return (
                        <div key={"evt-"+item.data.id} className="flex items-center gap-2 py-1.5">
                          <div className="h-px flex-1 bg-border/40" />
                          <span className="text-[11px] text-muted-foreground bg-muted/40 rounded-full px-2.5 py-1 italic">{historyLabel(item.data)}</span>
                          <div className="h-px flex-1 bg-border/40" />
                        </div>
                      );
                      const m = item.data as Comment;
                      const isOwn = m.author_id === user?.id;
                      const author = profileById(m.author_id);
                      const prev = items[idx-1];
                      const showAvatar = !prev || prev.kind !== "comment" || (prev.data as Comment).author_id !== m.author_id;
                      return (
                        <div key={m.id} className={cn("flex gap-3 group", isOwn && "flex-row-reverse", !showAvatar && "mt-0.5")}>
                          <div className="w-9 shrink-0">
                            {showAvatar && <Avatar className="h-9 w-9"><AvatarFallback className="text-[10px]">{initials(author?.full_name)}</AvatarFallback></Avatar>}
                          </div>
                          <div className={cn("max-w-[70%]", isOwn && "flex flex-col items-end")}>
                            {showAvatar && (
                              <div className={cn("flex items-baseline gap-2 mb-1", isOwn && "flex-row-reverse")}>
                                <span className="text-xs font-medium">{isOwn ? "Você" : (author?.full_name ?? "—")}</span>
                                <span className="text-[10px] text-muted-foreground">{formatDateTime(m.created_at)}</span>
                              </div>
                            )}
                            <div className={cn("rounded-2xl px-4 py-2.5 text-sm leading-relaxed relative group",
                              isOwn ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted rounded-tl-sm")}>
                              <span className="whitespace-pre-wrap break-words">{renderComment(m.content)}</span>
                              {(isOwn || isManagerOrAdmin) && (
                                <button
                                  onClick={async () => { await supabase.from("comments").delete().eq("id", m.id); setComments((cc) => cc.filter((x) => x.id !== m.id)); }}
                                  className={cn("absolute -top-1 opacity-0 group-hover:opacity-100 transition-opacity rounded-full p-0.5 bg-background border shadow-sm text-muted-foreground hover:text-destructive",
                                    isOwn ? "-left-6" : "-right-6")}>
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
                <div ref={chatBottomRef} />
              </div>
              {/* Input */}
              <div className="border-t bg-background px-4 py-3 shrink-0 relative">
                {mentionSearch !== null && mentionResults.length > 0 && (
                  <div className="absolute bottom-full mb-1 left-4 w-52 bg-background border rounded-xl shadow-xl z-50 overflow-hidden">
                    {mentionResults.map((p) => (
                      <button key={p.id} onClick={() => insertMention(p.full_name ?? "")} className="flex items-center gap-2 w-full px-3 py-2 hover:bg-muted text-left text-sm">
                        <Avatar className="h-5 w-5 shrink-0"><AvatarFallback className="text-[9px]">{initials(p.full_name)}</AvatarFallback></Avatar>
                        {p.full_name}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 items-end">
                  <Textarea
                    ref={commentRef}
                    value={newComment}
                    onChange={(e) => {
                      setNewComment(e.target.value);
                      const val = e.target.value;
                      const lastAt = val.lastIndexOf("@");
                      if (lastAt !== -1) {
                        const after = val.slice(lastAt + 1);
                        setMentionSearch(!after.includes(" ") ? after.toLowerCase() : null);
                      } else setMentionSearch(null);
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendComment(); } }}
                    placeholder="Digite @ para mencionar... Enter para enviar"
                    rows={1}
                    className="resize-none text-sm flex-1 bg-muted/30 min-h-[42px] max-h-[120px]"
                  />
                  <Button size="sm" onClick={sendComment} disabled={!newComment.trim()} className="h-10 w-10 p-0 rounded-full shrink-0">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Checklist */}
          {rightTab === "checklist" && (
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {checklist.length > 0 && (
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 transition-all rounded-full" style={{ width: `${Math.round((checklistDone/checklist.length)*100)}%` }} />
                  </div>
                  <span className="text-sm font-medium tabular-nums">{checklistDone}/{checklist.length}</span>
                </div>
              )}
              {checklist.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <ClipboardCheck className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Checklist vazio.</p>
                </div>
              )}
              <div className="space-y-1">
                {checklist.map((ci) => (
                  <div key={ci.id} className="flex items-center gap-3 py-2 px-2 rounded-lg group hover:bg-muted/30">
                    <Checkbox
                      checked={ci.done}
                      onCheckedChange={async (v) => {
                        setChecklist((ch) => ch.map((i) => i.id === ci.id ? { ...i, done: !!v } : i));
                        await supabase.from("checklists").update({ done: !!v }).eq("id", ci.id);
                      }}
                      className="h-5 w-5"
                    />
                    <span className={cn("text-sm flex-1", ci.done && "line-through text-muted-foreground")}>{ci.text}</span>
                    {isManagerOrAdmin && (
                      <button onClick={async () => { setChecklist((ch) => ch.filter((i) => i.id !== ci.id)); await supabase.from("checklists").delete().eq("id", ci.id); }}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {isManagerOrAdmin && (
                <div className="flex gap-2 border-t pt-4">
                  <Input className="text-sm" placeholder="Novo item..." value={newChecklist}
                    onChange={(e) => setNewChecklist(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === "Enter" && newChecklist.trim()) {
                        e.preventDefault();
                        const { data } = await supabase.from("checklists").insert([{ task_id: taskId, text: newChecklist.trim(), position: checklist.length }]).select().single();
                        if (data) { setChecklist((ch) => [...ch, data as ChecklistItem]); setNewChecklist(""); }
                      }
                    }} />
                  <Button size="sm" onClick={async () => {
                    if (!newChecklist.trim()) return;
                    const { data } = await supabase.from("checklists").insert([{ task_id: taskId, text: newChecklist.trim(), position: checklist.length }]).select().single();
                    if (data) { setChecklist((ch) => [...ch, data as ChecklistItem]); setNewChecklist(""); }
                  }} disabled={!newChecklist.trim()}><Plus className="h-4 w-4" /></Button>
                </div>
              )}
            </div>
          )}

          {/* Arquivos */}
          {rightTab === "files" && (
            <div className="flex-1 overflow-y-auto p-5">
              <TaskAttachments taskId={taskId} canUpload={isManagerOrAdmin} />
            </div>
          )}

          {/* Tempo */}
          {rightTab === "time" && (
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl">
                <div>
                  <div className="text-3xl font-bold tabular-nums">{Math.floor(totalMin/60)}h {totalMin%60}m</div>
                  <div className="text-xs text-muted-foreground mt-1">Total registrado</div>
                  {task.estimated_hours && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Estimado: {task.estimated_hours}h
                      {totalMin > task.estimated_hours * 60 && <span className="text-rose-500 ml-1 font-medium">· excedeu</span>}
                    </div>
                  )}
                </div>
                {activeTimer ? (
                  <Button variant="destructive" onClick={stopTimer}><Square className="h-4 w-4 mr-1" /> Parar</Button>
                ) : (
                  <Button onClick={startTimer}><Play className="h-4 w-4 mr-1" /> Iniciar</Button>
                )}
              </div>
              {timeEntries.map((te) => {
                const p = profileById(te.user_id);
                return (
                  <div key={te.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6"><AvatarFallback className="text-[10px]">{initials(p?.full_name)}</AvatarFallback></Avatar>
                      <span className="text-sm">{p?.full_name ?? "—"}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">{te.duration_minutes ? `${te.duration_minutes}m` : <span className="text-amber-600 animate-pulse">em curso...</span>}</div>
                      <div className="text-[10px] text-muted-foreground">{formatDateTime(te.started_at)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tarefa?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setDeleteOpen(false); onDelete(); }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

