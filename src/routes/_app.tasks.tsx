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
  Paperclip, Clock, ClipboardList, CheckCircle2, XCircle,
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
import { TaskLinks } from "@/components/tasks/task-links";
import { TaskBodyImages } from "@/components/tasks/task-body-images";
import { TemplatePicker, TaskTemplatesManager, type TaskTemplate } from "@/components/tasks/task-templates";
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

type TaskStatus = "new" | "in_progress" | "waiting" | "in_review" | "done" | "deferred";
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
  const { user, profile, loading, isAuthenticated, isManagerOrAdmin, canCreateTasks } = useAuth();
  const { play: playSound } = useSound();
  const navigate = useNavigate();
  const [view, setView] = useState<"kanban" | "list">("kanban");
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
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newProject, setNewProject] = useState("none");
  const [newAssignee, setNewAssignee] = useState("none");
  const [newPriority, setNewPriority] = useState<TaskPriority>("medium");
  const [newStatus, setNewStatus] = useState<TaskStatus>("new");
  const [newDue, setNewDue] = useState("");
  const [newType, setNewType] = useState<"internal" | "external">("internal");
  const [newValue, setNewValue] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [newBodyImages, setNewBodyImages] = useState<{ url: string; path: string; name: string }[]>([]);
  const [newChecklistItems, setNewChecklistItems] = useState<string[]>([]);
  const [showTemplatesManager, setShowTemplatesManager] = useState(false);

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
    const { error } = await supabase.from("tasks").update(update).eq("id", taskId);
    if (error) { toast.error(error.message); void load(); return; }
    if (user) {
      void runAutomations({ trigger: "status_changed", task: { ...task, ...update } as unknown as Record<string, unknown>, previousStatus: prevStatus, userId: user.id, userName: profile?.full_name ?? undefined });
      playSound(newSt === "done" ? "task_complete" : "status_change");
    if (newSt === "done") void runAutomations({ trigger: "task_completed", task: { ...task, ...update } as unknown as Record<string, unknown>, userId: user.id, userName: profile?.full_name ?? undefined });
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

  const createTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const title = newTitle.trim();
    if (!title) { toast.error("Informe um título."); return; }
    setCreateBusy(true);
    const assigneeProfile = profiles.find((p) => p.id === newAssignee);
    const taskType = assigneeProfile?.contract_type === "pj" ? "external" : newType;
    const payload = {
      title,
      description: newDesc || null,
      project_id: newProject === "none" ? null : newProject,
      assignee_id: newAssignee === "none" ? null : newAssignee,
      priority: newPriority,
      status: newStatus,
      due_date: newDue ? new Date(newDue).toISOString() : null,
      created_by: user.id,
      task_type: taskType,
      service_value: taskType === "external" && newValue ? Number(newValue) : null,
      position: tasks.length,
    };
    const { data, error } = await supabase.from("tasks").insert([payload]).select().single();
    setCreateBusy(false);
    if (error) { toast.error(error.message); return; }
    const createdTask = data as TaskRow;

    // Create checklist items from template
    if (newChecklistItems.length > 0) {
      await supabase.from("checklists").insert(
        newChecklistItems.map((text, i) => ({ task_id: createdTask.id, text, position: i, done: false }))
      );
    }

    // Register body images as attachments in DB
    if (newBodyImages.length > 0 && user) {
      await supabase.from("attachments").insert(
        newBodyImages.map((img) => ({
          task_id: createdTask.id,
          uploaded_by: user.id,
          file_name: img.name,
          storage_path: img.path,
          mime_type: "image/*",
          size_bytes: null,
        }))
      );
    }

    toast.success("Tarefa criada!");
    setTasks((prev) => [...prev, createdTask]);
    setNewTitle(""); setNewDesc(""); setNewDue(""); setNewValue("");
    setNewProject("none"); setNewAssignee("none");
    setNewPriority("medium"); setNewStatus("new"); setNewType("internal");
    setNewBodyImages([]); setNewChecklistItems([]);
    setCreateOpen(false);
    if (data) {
      void runAutomations({ trigger: "task_created", task: data as unknown as Record<string, unknown>, userId: user.id, userName: profile?.full_name ?? undefined });
      setPanelTaskId(createdTask.id);
    }
  };

  // Apply template to create form
  const applyTemplate = (t: TaskTemplate) => {
    // Título: preenche só se o campo estiver vazio
    if (t.default_title && !newTitle) setNewTitle(t.default_title);
    // Descrição: preenche só se vazia
    if (t.description && !newDesc) setNewDesc(t.description);
    setNewPriority(t.default_priority);
    setNewType(t.default_task_type);
    if (t.default_service_value) setNewValue(String(t.default_service_value));
    if (t.checklist_items && t.checklist_items.length > 0) setNewChecklistItems(t.checklist_items);
    toast.success(`Modelo "${t.name}" aplicado!`);
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
          </div>
          {isManagerOrAdmin && (
            <Button variant="outline" size="sm" onClick={() => setShowTemplatesManager(true)}>
              <ClipboardList className="h-4 w-4 mr-1" /> Modelos
            </Button>
          )}
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
              <div className="flex gap-3 pb-4 overflow-x-auto h-full">
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
          ) : (
            <TaskListView
              tasks={filtered}
              profileById={profileById}
              projectById={projectById}
              activePanelId={panelTaskId}
              onOpenPanel={setPanelTaskId}
              onQuickStatus={quickStatusChange}
              onDelete={deleteTask}
              isManagerOrAdmin={isManagerOrAdmin}
              navigate={navigate}
            />
          )}
        </div>

        {/* Drawer overlay — slides in from right over the kanban */}
        {panelTaskId && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40 bg-black/30"
              onClick={() => setPanelTaskId(null)}
            />
            <div className="fixed right-0 top-0 bottom-0 z-50 flex">
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
      {createOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setCreateOpen(false)}>
          <div className="bg-background rounded-xl border shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-background z-10 gap-3 flex-wrap">
              <h2 className="text-lg font-semibold">Nova tarefa</h2>
              <div className="flex items-center gap-2 ml-auto">
                <TemplatePicker onApply={applyTemplate} />
                {isManagerOrAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowTemplatesManager(true)}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 border rounded-md px-2 py-1 hover:bg-muted"
                  >
                    <ClipboardList className="h-3.5 w-3.5" /> Gerenciar modelos
                  </button>
                )}
                <button onClick={() => setCreateOpen(false)} className="text-muted-foreground hover:text-foreground rounded-full p-1 hover:bg-muted">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <form onSubmit={createTask} className="p-5 space-y-4">
              <div>
                <label className="text-sm font-medium">Título *</label>
                <Input className="mt-1 text-base" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="O que precisa ser feito?" autoFocus />
              </div>
              <div>
                <label className="text-sm font-medium">Descrição</label>
                <Textarea className="mt-1" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Contexto, links, detalhes..." rows={3} />
              </div>
              {/* Images in body */}
              <div>
                <label className="text-sm font-medium">Imagens no corpo</label>
                <div className="mt-1">
                  <TaskBodyImages images={newBodyImages} onChange={setNewBodyImages} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Projeto</label>
                  <Select value={newProject} onValueChange={setNewProject}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem projeto</SelectItem>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full inline-block" style={{ background: p.color ?? "#3b82f6" }} />
                            {p.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Responsável</label>
                  <Select value={newAssignee} onValueChange={(v) => {
                    setNewAssignee(v);
                    const p = profiles.find((x) => x.id === v);
                    setNewType(p?.contract_type === "pj" ? "external" : "internal");
                  }}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem responsável</SelectItem>
                      {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name ?? "—"}{p.contract_type === "pj" ? " (PJ)" : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Prioridade</label>
                  <Select value={newPriority} onValueChange={(v) => setNewPriority(v as TaskPriority)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(PRIORITY_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Status inicial</label>
                  <Select value={newStatus} onValueChange={(v) => setNewStatus(v as TaskStatus)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Prazo</label>
                  <Input type="date" className="mt-1" value={newDue} onChange={(e) => setNewDue(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Tipo</label>
                  <Select value={newType} onValueChange={(v) => setNewType(v as "internal" | "external")}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="internal">Interna (CLT)</SelectItem>
                      <SelectItem value="external">Externa (PJ)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {newType === "external" && (
                <div>
                  <label className="text-sm font-medium">Valor do serviço (R$)</label>
                  <Input type="number" step="0.01" min="0" className="mt-1" value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="Ex: 150.00" />
                </div>
              )}
              {/* Checklist preview from template */}
              {newChecklistItems.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-medium">Checklist do modelo ({newChecklistItems.length} itens)</label>
                    <button type="button" className="text-xs text-muted-foreground hover:text-destructive" onClick={() => setNewChecklistItems([])}>
                      Remover checklist
                    </button>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-2 space-y-1 max-h-40 overflow-y-auto">
                    {newChecklistItems.map((item, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <div className="h-3.5 w-3.5 rounded border border-muted-foreground/40 shrink-0" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={createBusy || !newTitle.trim()}>{createBusy ? "Criando..." : "Criar tarefa"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Templates manager modal */}
      <TaskTemplatesManager open={showTemplatesManager} onClose={() => setShowTemplatesManager(false)} />
    </div>
  );
}

// ─── Kanban Column ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<TaskStatus, string> = {
  new: "bg-slate-400",
  in_progress: "bg-blue-500",
  waiting: "bg-amber-400",
  in_review: "bg-purple-500",
  done: "bg-emerald-500",
  deferred: "bg-neutral-400",
};

function KanbanColumn({
  status, tasks, profileById, projectById, activePanelId, onOpenPanel,
  isManagerOrAdmin, onQuickStatus, onDelete, userId, onInlineCreate,
}: {
  status: TaskStatus;
  tasks: TaskRow[];
  profileById: (id: string | null) => ProfileLite | undefined;
  projectById: (id: string | null) => ProjectLite | undefined;
  activePanelId: string | null;
  onOpenPanel: (id: string) => void;
  isManagerOrAdmin: boolean;
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
    const { data, error } = await supabase.from("tasks").insert([{
      title, status, priority: "medium", created_by: userId, position: tasks.length,
    }]).select().single();
    if (error) { toast.error(error.message); return; }
    onInlineCreate(data as TaskRow);
    setInlineTitle(""); setAdding(false);
  };

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-xl border bg-muted/20 flex flex-col min-w-[272px] w-[272px]",
        "max-h-[calc(100vh-230px)]",
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
  isManagerOrAdmin, onQuickStatus, onDelete,
}: {
  task: TaskRow;
  profileById: (id: string | null) => ProfileLite | undefined;
  projectById: (id: string | null) => ProjectLite | undefined;
  onOpenPanel: (id: string) => void;
  isActive: boolean;
  isManagerOrAdmin: boolean;
  onQuickStatus: (id: string, st: TaskStatus) => void;
  onDelete: (id: string) => void;
}) {
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
        <div className="w-full overflow-hidden bg-muted" style={{ height: "88px" }}>
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
                <DropdownMenuSeparator />
                <div className="px-2 py-1 text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Mover para</div>
                {STATUS_ORDER.filter((s) => s !== task.status).map((s) => (
                  <DropdownMenuItem key={s} onClick={() => onQuickStatus(task.id, s)}>
                    <ChevronRight className="h-3.5 w-3.5 mr-2" /> {STATUS_LABEL[s]}
                  </DropdownMenuItem>
                ))}
                {isManagerOrAdmin && (
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
  onQuickStatus, onDelete, isManagerOrAdmin, navigate,
}: {
  tasks: TaskRow[];
  profileById: (id: string | null) => ProfileLite | undefined;
  projectById: (id: string | null) => ProjectLite | undefined;
  activePanelId: string | null;
  onOpenPanel: (id: string) => void;
  onQuickStatus: (id: string, st: TaskStatus) => void;
  onDelete: (id: string) => void;
  isManagerOrAdmin: boolean;
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

// ─── Side Panel ────────────────────────────────────────────────────────────────

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
  const [newTag, setNewTag] = useState("");
  const [activeTimer, setActiveTimer] = useState<string | null>(null);
  const [leftTab, setLeftTab] = useState<"details" | "checklist" | "time">("details");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [history, setHistory] = useState<Array<{ id: string; action: string; field: string | null; old_value: string | null; new_value: string | null; user_id: string | null; created_at: string }>>([]);
  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);

  const loadPanel = useCallback(async () => {
    setLoading(true);
    const [t, sub, c, ch, te, hist] = await Promise.all([
      supabase.from("tasks").select("*").eq("id", taskId).maybeSingle(),
      supabase.from("tasks").select("id,title,status,priority,assignee_id").eq("parent_task_id", taskId),
      supabase.from("comments").select("*").eq("task_id", taskId).order("created_at"),
      supabase.from("checklists").select("*").eq("task_id", taskId).order("position"),
      supabase.from("time_entries").select("*").eq("task_id", taskId).order("started_at", { ascending: false }),
      supabase.from("task_history").select("*").eq("task_id", taskId).order("created_at"),
    ]);
    if (t.data) { setTask(t.data as TaskRow); setTitleDraft((t.data as TaskRow).title); onTaskUpdate(t.data as TaskRow); }
    setSubtasks((sub.data ?? []) as SubTask[]);
    setComments((c.data ?? []) as Comment[]);
    setChecklist((ch.data ?? []) as ChecklistItem[]);
    setTimeEntries((te.data ?? []) as TimeEntry[]);
    const open = (te.data ?? []).find((x) => (x as TimeEntry).user_id === user?.id && !(x as TimeEntry).ended_at);
    setActiveTimer(open ? (open as TimeEntry).id : null);
    setHistory((hist.data ?? []) as typeof history);
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
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [taskId, user?.id]);

  // Auto scroll chat
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
    if ("status" in patch && patch.status !== task.status) {
      entries.push({ task_id: task.id, user_id: user.id, action: "status_changed", field: "status", old_value: task.status, new_value: patch.status as string });
    }
    if ("assignee_id" in patch && patch.assignee_id !== task.assignee_id) {
      entries.push({ task_id: task.id, user_id: user.id, action: "assigned", field: "assignee_id", old_value: task.assignee_id, new_value: patch.assignee_id as string | null });
    }
    if ("due_date" in patch && patch.due_date !== task.due_date) {
      entries.push({ task_id: task.id, user_id: user.id, action: "due_changed", field: "due_date", old_value: task.due_date, new_value: patch.due_date as string | null });
    }
    if ("priority" in patch && patch.priority !== task.priority) {
      entries.push({ task_id: task.id, user_id: user.id, action: "priority_changed", field: "priority", old_value: task.priority, new_value: patch.priority as string });
    }
    if ("title" in patch && patch.title !== task.title) {
      entries.push({ task_id: task.id, user_id: user.id, action: "title_changed", field: "title", old_value: task.title, new_value: patch.title as string });
    }
    if (entries.length > 0) {
      const { data: newHist } = await supabase.from("task_history").insert(entries).select();
      if (newHist) setHistory((h) => [...h, ...(newHist as typeof history)]);
    }
  };

  const profileById = (id: string | null) => profiles.find((p) => p.id === id);
  const canEdit = isManagerOrAdmin || user?.id === task?.created_by || user?.id === task?.assignee_id;
  const canDelete = isAdmin || user?.id === task?.created_by;

  const sendComment = async () => {
    if (!user || !newComment.trim() || !task) return;
    const content = newComment.trim();
    setNewComment("");
    const { error } = await supabase.from("comments").insert([{ task_id: task.id, author_id: user.id, content }]);
    if (error) { toast.error(error.message); setNewComment(content); return; }
    void runAutomations({ trigger: "comment_added", task: task as unknown as Record<string, unknown>, comment: { content, author_id: user.id }, userId: user.id, userName: authProfile?.full_name ?? undefined });
  };

  const handleCommentKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendComment(); }
    const val = (e.target as HTMLTextAreaElement).value;
    const lastAt = val.lastIndexOf("@");
    if (lastAt !== -1) {
      const after = val.slice(lastAt + 1);
      if (!after.includes(" ")) setMentionSearch(after.toLowerCase());
      else setMentionSearch(null);
    } else setMentionSearch(null);
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

  const addChecklist = async () => {
    if (!newChecklist.trim()) return;
    const { data, error } = await supabase.from("checklists").insert([{ task_id: taskId, text: newChecklist.trim(), position: checklist.length }]).select().single();
    if (error) { toast.error(error.message); return; }
    setChecklist((c) => [...c, data as ChecklistItem]);
    setNewChecklist("");
  };

  const toggleChecklist = async (id: string, done: boolean) => {
    setChecklist((c) => c.map((i) => i.id === id ? { ...i, done } : i));
    await supabase.from("checklists").update({ done }).eq("id", id);
  };

  const deleteChecklist = async (id: string) => {
    setChecklist((c) => c.filter((i) => i.id !== id));
    await supabase.from("checklists").delete().eq("id", id);
  };

  const addTag = async () => {
    if (!task || !newTag.trim()) return;
    const tag = newTag.trim().toLowerCase();
    const current = task.tags ?? [];
    if (current.includes(tag)) { setNewTag(""); return; }
    await update({ tags: [...current, tag] });
    setNewTag("");
  };

  const removeTag = async (tag: string) => {
    if (!task) return;
    await update({ tags: (task.tags ?? []).filter((t) => t !== tag) });
  };

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

  const addSubtask = async () => {
    if (!subtaskTitle.trim() || !user || !task) return;
    const { data, error } = await supabase.from("tasks").insert([{
      title: subtaskTitle.trim(), status: "new" as TaskStatus, priority: "medium" as TaskPriority,
      parent_task_id: task.id, project_id: task.project_id, created_by: user.id, position: subtasks.length,
    }]).select().single();
    if (error) { toast.error(error.message); return; }
    setSubtasks((s) => [...s, data as SubTask]);
    setSubtaskTitle(""); setAddingSubtask(false);
  };

  const renderCommentContent = (content: string) => {
    const parts = content.split(/(@\S+)/g);
    return parts.map((part, i) => {
      if (part.startsWith("@")) {
        const name = part.slice(1);
        const found = profiles.find((p) => p.full_name?.toLowerCase() === name.toLowerCase());
        if (found) return <span key={i} className="text-primary font-medium bg-primary/10 rounded px-0.5">{part}</span>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  const totalMin = timeEntries.reduce((s, t) => s + (t.duration_minutes ?? 0), 0);
  const checklistDone = checklist.filter((c) => c.done).length;
  const assignee = profileById(task?.assignee_id ?? null);
  const creator = profileById(task?.created_by ?? null);

  // Merge comments + history into unified timeline
  type TimelineItem =
    | { kind: "comment"; data: Comment }
    | { kind: "event"; data: typeof history[number] };

  const timeline: TimelineItem[] = [
    ...comments.map((m) => ({ kind: "comment" as const, data: m })),
    ...history.map((h) => ({ kind: "event" as const, data: h })),
  ].sort((a, b) => new Date(a.data.created_at).getTime() - new Date(b.data.created_at).getTime());

  const groupedTimeline: { date: string; items: TimelineItem[] }[] = [];
  for (const item of timeline) {
    const d = new Date(item.data.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
    const last = groupedTimeline[groupedTimeline.length - 1];
    if (last?.date === d) last.items.push(item);
    else groupedTimeline.push({ date: d, items: [item] });
  }

  const historyLabel = (h: typeof history[number]) => {
    const actor = profileById(h.user_id)?.full_name ?? "Alguém";
    const { action, old_value, new_value } = h;
    if (action === "status_changed") return `${actor} mudou o status: ${STATUS_LABEL[old_value ?? ""] ?? old_value} → ${STATUS_LABEL[new_value ?? ""] ?? new_value}`;
    if (action === "assigned") {
      const newAssignee = profileById(new_value)?.full_name ?? "ninguém";
      return `${actor} atribuiu a tarefa para ${newAssignee}`;
    }
    if (action === "due_changed") {
      const d = new_value ? new Date(new_value).toLocaleDateString("pt-BR") : "sem prazo";
      return `${actor} alterou o prazo para ${d}`;
    }
    if (action === "priority_changed") return `${actor} mudou a prioridade para ${PRIORITY_LABEL[new_value ?? ""] ?? new_value}`;
    if (action === "title_changed") return `${actor} renomeou a tarefa`;
    if (action === "created") return `${actor} criou esta tarefa`;
    if (action === "completed") return `${actor} concluiu a tarefa`;
    return `${actor} atualizou a tarefa`;
  };

  if (loading) {
    return (
      <div className="w-[860px] shrink-0 border rounded-xl bg-background flex items-center justify-center shadow-lg">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!task) return null;

  const proj = projects.find((p) => p.id === task.project_id);

  return (
    <div className="w-[860px] border-l bg-background flex flex-col h-full overflow-hidden shadow-2xl">

      {/* ── Top bar ───────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/5 shrink-0">
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <input
              className="w-full text-base font-semibold bg-transparent border-b-2 border-primary outline-none"
              value={titleDraft}
              autoFocus
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={async () => {
                setEditingTitle(false);
                if (titleDraft.trim() && titleDraft !== task.title) await update({ title: titleDraft.trim() });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") { setTitleDraft(task.title); setEditingTitle(false); }
              }}
            />
          ) : (
            <h2
              className={cn("text-base font-semibold truncate group flex items-center gap-1.5", canEdit && "cursor-text hover:text-primary")}
              onClick={() => { if (canEdit) setEditingTitle(true); }}
            >
              {task.title}
              {canEdit && <Edit3 className="h-3.5 w-3.5 shrink-0 opacity-0 group-hover:opacity-40" />}
            </h2>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {activeTimer ? (
            <button onClick={stopTimer} className="flex items-center gap-1 text-xs bg-rose-100 text-rose-700 rounded-md px-2 py-1 hover:bg-rose-200 font-medium">
              <Square className="h-3 w-3" /> Parar timer
            </button>
          ) : (
            <button onClick={startTimer} className="flex items-center gap-1 text-xs text-muted-foreground rounded-md px-2 py-1 hover:bg-muted border font-medium">
              <Play className="h-3 w-3" /> Timer
            </button>
          )}
          {/* Approval buttons */}
          {task.status !== "awaiting_approval" && task.status !== "done" && user?.id === task.assignee_id && (
            <button
              onClick={() => void update({ status: "awaiting_approval" as TaskStatus })}
              className="flex items-center gap-1 text-xs bg-orange-100 text-orange-700 rounded-md px-2 py-1 hover:bg-orange-200 font-medium"
            >
              <CheckCircle2 className="h-3 w-3" /> Enviar para revisão
            </button>
          )}
          {task.status === "awaiting_approval" && isManagerOrAdmin && (
            <div className="flex gap-1">
              <button
                onClick={async () => {
                  await update({ status: "done" as TaskStatus, approved_by: user?.id ?? null, approved_at: new Date().toISOString() });
                  toast.success("Tarefa aprovada!");
                }}
                className="flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 rounded-md px-2 py-1 hover:bg-emerald-200 font-medium"
              >
                <CheckCircle2 className="h-3 w-3" /> Aprovar
              </button>
              <button
                onClick={async () => {
                  const note = window.prompt("Motivo da devolução (opcional):");
                  await update({ status: "in_review" as TaskStatus, returned_at: new Date().toISOString(), return_note: note ?? null });
                  toast.success("Tarefa devolvida para revisão.");
                }}
                className="flex items-center gap-1 text-xs bg-rose-100 text-rose-700 rounded-md px-2 py-1 hover:bg-rose-200 font-medium"
              >
                <XCircle className="h-3 w-3" /> Devolver
              </button>
            </div>
          )}
          <button onClick={() => navigate({ to: "/tasks/$taskId", params: { taskId: task.id } })} className="p-1.5 rounded hover:bg-muted text-muted-foreground" title="Abrir página completa">
            <ExternalLink className="h-4 w-4" />
          </button>
          <button onClick={() => { void navigator.clipboard.writeText(window.location.origin + `/tasks/${task.id}`); toast.success("Link copiado!"); }} className="p-1.5 rounded hover:bg-muted text-muted-foreground" title="Copiar link">
            <Copy className="h-4 w-4" />
          </button>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-muted text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Body: left info + right chat ─────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT PANEL ──────────────────────────────────────── */}
        <div className="w-[320px] shrink-0 border-r flex flex-col overflow-hidden">

          {/* Status + priority badges */}
          <div className="flex flex-wrap gap-1.5 px-4 pt-3 pb-2 border-b shrink-0">
            <Select value={task.status} onValueChange={(v) => void update({ status: v as TaskStatus })} disabled={!canEdit}>
              <SelectTrigger className={cn("h-6 text-xs border-0 px-2 py-0 font-medium w-auto gap-1", STATUS_COLOR[task.status])}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={task.priority} onValueChange={(v) => void update({ priority: v as TaskPriority })} disabled={!canEdit}>
              <SelectTrigger className={cn("h-6 text-xs border-0 px-2 py-0 font-medium w-auto gap-1", PRIORITY_COLOR[task.priority])}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PRIORITY_LABEL).map(([k, v]) => <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>)}
              </SelectContent>
            </Select>
            {task.task_type === "external" && (
              <Badge variant="outline" className="text-xs border-emerald-300 text-emerald-700 h-6">
                PJ{task.service_value ? ` · ${formatBRL(task.service_value)}` : ""}
              </Badge>
            )}
          </div>

          {/* Left tabs */}
          <div className="flex border-b shrink-0">
            {([["details", "Tarefa", Edit3], ["checklist", "Checklist", ClipboardCheck], ["time", "Tempo", Clock]] as const).map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => setLeftTab(id)}
                className={cn(
                  "flex items-center gap-1 px-3 py-2 text-xs font-medium border-b-2 transition-colors",
                  leftTab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                {id === "checklist" && checklist.length > 0 && (
                  <span className="text-[10px] bg-muted rounded-full px-1">{checklistDone}/{checklist.length}</span>
                )}
              </button>
            ))}
          </div>

          {/* Left content */}
          <div className="flex-1 overflow-y-auto">
            {leftTab === "details" && (
              <div className="p-4 space-y-3">
                {/* Description */}
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Descrição</label>
                  <Textarea
                    className="mt-1 text-sm resize-none"
                    rows={3}
                    value={task.description ?? ""}
                    onChange={(e) => setTask({ ...task, description: e.target.value })}
                    onBlur={(e) => void update({ description: e.target.value || null })}
                    placeholder="Adicionar descrição..."
                    disabled={!canEdit}
                  />
                </div>

                {/* Meta fields — Bitrix style row layout */}
                <div className="space-y-2.5">
                  {/* Owner/Creator */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground text-xs">Criado por</span>
                    <div className="flex items-center gap-1.5">
                      <Avatar className="h-5 w-5"><AvatarFallback className="text-[9px]">{initials(creator?.full_name)}</AvatarFallback></Avatar>
                      <span className="text-xs font-medium">{creator?.full_name ?? "—"}</span>
                    </div>
                  </div>

                  {/* Assignee */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground text-xs">Responsável</span>
                    <Select
                      value={task.assignee_id ?? "none"}
                      onValueChange={(v) => {
                        const newId = v === "none" ? null : v;
                        const p = profiles.find((x) => x.id === newId);
                        const patch: Partial<TaskRow> = { assignee_id: newId };
                        if (p?.contract_type === "pj") patch.task_type = "external";
                        else if (p?.contract_type === "clt") patch.task_type = "internal";
                        void update(patch);
                      }}
                      disabled={!isManagerOrAdmin}
                    >
                      <SelectTrigger className="h-7 text-xs border-0 bg-muted/30 hover:bg-muted rounded-md w-[160px] px-2">
                        <div className="flex items-center gap-1.5 truncate">
                          <Avatar className="h-4 w-4 shrink-0"><AvatarFallback className="text-[8px]">{initials(assignee?.full_name)}</AvatarFallback></Avatar>
                          <span className="truncate">{assignee?.full_name ?? "Nenhum"}</span>
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" className="text-xs">Sem responsável</SelectItem>
                        {profiles.map((p) => <SelectItem key={p.id} value={p.id} className="text-xs">{p.full_name ?? "—"}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Due date */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground text-xs flex items-center gap-1"><Calendar className="h-3 w-3" /> Prazo</span>
                    <Input
                      type="date"
                      className="h-7 text-xs border-0 bg-muted/30 hover:bg-muted rounded-md w-[140px] px-2"
                      value={task.due_date ? task.due_date.slice(0, 10) : ""}
                      onChange={(e) => void update({ due_date: e.target.value ? new Date(e.target.value).toISOString() : null })}
                      disabled={!canEdit}
                    />
                  </div>

                  {/* Project */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground text-xs flex items-center gap-1"><FolderKanban className="h-3 w-3" /> Projeto</span>
                    <Select value={task.project_id ?? "none"} onValueChange={(v) => void update({ project_id: v === "none" ? null : v })} disabled={!canEdit}>
                      <SelectTrigger className="h-7 text-xs border-0 bg-muted/30 hover:bg-muted rounded-md w-[160px] px-2">
                        <div className="flex items-center gap-1.5 truncate">
                          {proj && <span className="h-2 w-2 rounded-full shrink-0" style={{ background: proj.color ?? "#3b82f6" }} />}
                          <span className="truncate">{proj?.name ?? "Nenhum"}</span>
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" className="text-xs">Sem projeto</SelectItem>
                        {projects.map((p) => <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Estimated hours */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground text-xs">Horas est.</span>
                    <Input
                      type="number" step="0.25" min="0"
                      className="h-7 text-xs border-0 bg-muted/30 hover:bg-muted rounded-md w-[100px] px-2"
                      value={task.estimated_hours ?? ""}
                      onChange={(e) => setTask({ ...task, estimated_hours: e.target.value ? Number(e.target.value) : null })}
                      onBlur={(e) => void update({ estimated_hours: e.target.value ? Number(e.target.value) : null })}
                      disabled={!canEdit}
                    />
                  </div>

                  {/* Type + value */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground text-xs">Tipo</span>
                    <Select value={task.task_type} onValueChange={(v) => void update({ task_type: v as "internal" | "external" })} disabled={!canEdit}>
                      <SelectTrigger className="h-7 text-xs border-0 bg-muted/30 hover:bg-muted rounded-md w-[120px] px-2"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="internal" className="text-xs">Interna (CLT)</SelectItem>
                        <SelectItem value="external" className="text-xs">Externa (PJ)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {task.task_type === "external" && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground text-xs">Valor (R$)</span>
                      <Input
                        type="number" step="0.01" min="0"
                        className="h-7 text-xs border-0 bg-muted/30 hover:bg-muted rounded-md w-[120px] px-2"
                        value={task.service_value ?? ""}
                        onChange={(e) => setTask({ ...task, service_value: e.target.value ? Number(e.target.value) : null })}
                        onBlur={(e) => void update({ service_value: e.target.value ? Number(e.target.value) : null })}
                        disabled={!canEdit}
                      />
                    </div>
                  )}
                </div>

                {/* Tags */}
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1"><Tag className="h-3 w-3" /> Tags</label>
                  <div className="flex flex-wrap gap-1 mt-1.5 mb-1">
                    {(task.tags ?? []).map((tag) => (
                      <span key={tag} className="flex items-center gap-0.5 text-[11px] bg-primary/10 text-primary rounded-full px-2 py-0.5">
                        {tag}
                        {canEdit && <button onClick={() => removeTag(tag)} className="hover:text-rose-500 ml-0.5"><X className="h-2.5 w-2.5" /></button>}
                      </span>
                    ))}
                  </div>
                  {canEdit && (
                    <div className="flex gap-1">
                      <Input className="h-7 text-xs flex-1" placeholder="Nova tag..." value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())} />
                      <Button size="sm" variant="outline" className="h-7 px-2" onClick={addTag} disabled={!newTag.trim()}><Plus className="h-3 w-3" /></Button>
                    </div>
                  )}
                </div>

                {/* Subtasks */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Subtarefas ({subtasks.length})</label>
                    <button onClick={() => setAddingSubtask(true)} className="text-xs text-primary hover:underline flex items-center gap-0.5"><Plus className="h-3 w-3" /> Adicionar</button>
                  </div>
                  {subtasks.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 py-1 border-b last:border-0">
                      <div className={cn("h-1.5 w-1.5 rounded-full shrink-0", s.status === "done" ? "bg-emerald-500" : "bg-slate-400")} />
                      <span className={cn("text-xs flex-1 truncate", s.status === "done" && "line-through text-muted-foreground")}>{s.title}</span>
                      <Badge variant="outline" className="text-[9px] px-1 h-4">{STATUS_LABEL[s.status]}</Badge>
                    </div>
                  ))}
                  {addingSubtask && (
                    <div className="flex gap-1 mt-1">
                      <Input className="h-7 text-xs flex-1" placeholder="Título da subtarefa..." value={subtaskTitle}
                        onChange={(e) => setSubtaskTitle(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addSubtask(); } if (e.key === "Escape") { setAddingSubtask(false); setSubtaskTitle(""); } }}
                        autoFocus />
                      <Button size="sm" className="h-7 px-2" onClick={addSubtask} disabled={!subtaskTitle.trim()}>OK</Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setAddingSubtask(false); setSubtaskTitle(""); }}><X className="h-3 w-3" /></Button>
                    </div>
                  )}
                </div>

                {/* Links */}
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-1.5">
                    <ExternalLink className="h-3 w-3" /> Links
                  </label>
                  <TaskLinks taskId={taskId} canEdit={canEdit} />
                </div>

                {/* Attachments */}
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-1.5">
                    <Paperclip className="h-3 w-3" /> Arquivos
                  </label>
                  <TaskAttachments taskId={taskId} createdBy={task.created_by} />
                </div>

                {/* Footer */}
                <div className="pt-2 border-t space-y-1">
                  <div className="text-[10px] text-muted-foreground">
                    ID: {task.id.slice(0, 8).toUpperCase()} · Criada em {formatDateTime(task.created_at)}
                    {task.completed_at && ` · Concluída ${formatDateTime(task.completed_at)}`}
                  </div>
                  {canDelete && (
                    <button onClick={() => setDeleteOpen(true)} className="text-xs text-destructive hover:underline flex items-center gap-1">
                      <Trash2 className="h-3 w-3" /> Excluir tarefa
                    </button>
                  )}
                </div>
              </div>
            )}

            {leftTab === "checklist" && (
              <div className="p-4 space-y-3">
                {checklist.length > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 transition-all rounded-full" style={{ width: `${Math.round((checklistDone / checklist.length) * 100)}%` }} />
                    </div>
                    <span className="text-xs font-medium tabular-nums">{checklistDone}/{checklist.length}</span>
                  </div>
                )}
                {checklist.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <ClipboardCheck className="h-8 w-8 mx-auto mb-2 opacity-20" />
                    Nenhum item.
                  </div>
                )}
                <div className="space-y-1">
                  {checklist.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 py-1 px-1 rounded group hover:bg-muted/30">
                      <Checkbox checked={c.done} onCheckedChange={(v) => void toggleChecklist(c.id, !!v)} className="h-4 w-4" />
                      <span className={cn("text-sm flex-1", c.done && "line-through text-muted-foreground")}>{c.text}</span>
                      <button onClick={() => deleteChecklist(c.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 border-t pt-3">
                  <Input className="text-sm" placeholder="Novo item..." value={newChecklist}
                    onChange={(e) => setNewChecklist(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addChecklist())} />
                  <Button size="sm" onClick={addChecklist} disabled={!newChecklist.trim()}><Plus className="h-4 w-4" /></Button>
                </div>
              </div>
            )}

            {leftTab === "time" && (
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div>
                    <div className="text-2xl font-bold tabular-nums">{Math.floor(totalMin / 60)}h {totalMin % 60}m</div>
                    <div className="text-xs text-muted-foreground">Total registrado</div>
                    {task.estimated_hours && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Estimado: {task.estimated_hours}h
                        {totalMin > task.estimated_hours * 60 && <span className="text-rose-500 ml-1 font-medium">· excedeu</span>}
                      </div>
                    )}
                  </div>
                  {activeTimer ? (
                    <Button size="sm" variant="destructive" onClick={stopTimer}><Square className="h-3 w-3 mr-1" /> Parar</Button>
                  ) : (
                    <Button size="sm" onClick={startTimer}><Play className="h-3 w-3 mr-1" /> Iniciar</Button>
                  )}
                </div>
                {timeEntries.length === 0 && (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    <Clock className="h-8 w-8 mx-auto mb-2 opacity-20" />
                    Nenhum tempo registrado.
                  </div>
                )}
                {timeEntries.map((te) => {
                  const p = profileById(te.user_id);
                  return (
                    <div key={te.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                      <div className="flex items-center gap-1.5">
                        <Avatar className="h-5 w-5"><AvatarFallback className="text-[9px]">{initials(p?.full_name)}</AvatarFallback></Avatar>
                        <span className="text-xs">{p?.full_name ?? "—"}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-medium">{te.duration_minutes ? `${te.duration_minutes}m` : <span className="text-amber-600 animate-pulse">em curso…</span>}</div>
                        <div className="text-[10px] text-muted-foreground">{formatDateTime(te.started_at)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL — Chat estilo Bitrix ────────────────── */}
        <div className="flex-1 flex flex-col bg-muted/5 overflow-hidden">
          {/* Chat header */}
          <div className="px-4 py-2.5 border-b bg-background shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Bate-papo da tarefa</span>
              <span className="text-xs text-muted-foreground">{comments.length} mensagem{comments.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="flex items-center -space-x-1">
              {profiles.slice(0, 4).map((p) => (
                <Avatar key={p.id} className="h-6 w-6 border-2 border-background">
                  <AvatarFallback className="text-[9px]">{initials(p.full_name)}</AvatarFallback>
                </Avatar>
              ))}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
            {timeline.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <MessageSquare className="h-10 w-10 mb-2 opacity-20" />
                <p className="text-sm">Nenhuma mensagem ainda.</p>
                <p className="text-xs">Comece a conversa sobre esta tarefa.</p>
              </div>
            )}

            {groupedTimeline.map(({ date, items }) => (
              <div key={date}>
                <div className="flex items-center gap-2 my-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[11px] text-muted-foreground bg-muted/5 px-2">{date}</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                {items.map((item, idx) => {
                  if (item.kind === "event") {
                    return (
                      <div key={"evt-" + item.data.id} className="flex items-center gap-2 py-1.5 px-1">
                        <div className="h-px flex-1 bg-border/40" />
                        <span className="text-[11px] text-muted-foreground bg-muted/40 rounded-full px-2.5 py-1 whitespace-nowrap italic">
                          {historyLabel(item.data)}
                        </span>
                        <div className="h-px flex-1 bg-border/40" />
                      </div>
                    );
                  }
                  const m = item.data as Comment;
                  const isOwn = m.author_id === user?.id;
                  const author = profileById(m.author_id);
                  const prevItem = items[idx - 1];
                  const showAvatar = !prevItem || prevItem.kind !== "comment" || (prevItem.data as Comment).author_id !== m.author_id;
                  return (
                    <div key={m.id} className={cn("flex gap-2 group", isOwn && "flex-row-reverse", !showAvatar && "mt-0.5")}>
                      <div className="w-8 shrink-0">
                        {showAvatar && (
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-[10px]">{initials(author?.full_name)}</AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                      <div className={cn("max-w-[75%]", isOwn && "flex flex-col items-end")}>
                        {showAvatar && (
                          <div className={cn("flex items-baseline gap-2 mb-0.5", isOwn && "flex-row-reverse")}>
                            <span className="text-xs font-medium">{isOwn ? "Você" : (author?.full_name ?? "—")}</span>
                            <span className="text-[10px] text-muted-foreground">{formatDateTime(m.created_at)}</span>
                          </div>
                        )}
                        <div className={cn(
                          "rounded-2xl px-3 py-2 text-sm leading-relaxed relative",
                          isOwn ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-background border rounded-tl-sm shadow-sm",
                        )}>
                          <span className="whitespace-pre-wrap break-words">{renderCommentContent(m.content)}</span>
                          {(isOwn || isManagerOrAdmin) && (
                            <button
                              onClick={async () => { await supabase.from("comments").delete().eq("id", m.id); setComments((prev) => prev.filter((x) => x.id !== m.id)); }}
                              className={cn(
                                "absolute -top-1 opacity-0 group-hover:opacity-100 transition-opacity rounded-full p-0.5 bg-background border shadow-sm text-muted-foreground hover:text-destructive",
                                isOwn ? "-left-6" : "-right-6"
                              )}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
