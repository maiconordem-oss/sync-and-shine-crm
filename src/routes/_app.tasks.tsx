import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, KanbanSquare, List as ListIcon, Search } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials, formatDate, isOverdue } from "@/lib/format";
import { STATUS_LABEL, STATUS_ORDER, PRIORITY_COLOR, PRIORITY_LABEL, STATUS_COLOR } from "@/lib/labels";
import { cn } from "@/lib/utils";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { runAutomations } from "@/lib/automations";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/tasks")({
  component: TasksPage,
});

type TaskStatus = "new" | "in_progress" | "waiting" | "in_review" | "done" | "deferred";
type TaskPriority = "low" | "medium" | "high" | "urgent";

interface TaskRow {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string | null;
  project_id: string | null;
  due_date: string | null;
  tags: string[] | null;
  created_by: string | null;
  parent_task_id: string | null;
  position: number;
}

interface ProfileLite { id: string; full_name: string | null; contract_type?: "clt" | "pj" | null }
interface ProjectLite { id: string; name: string; color: string | null }

function TasksPage() {
  const { user, profile, loading, isAuthenticated } = useAuth();
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [search, setSearch] = useState("");
  const [filterProject, setFilterProject] = useState<string>("all");
  const [filterAssignee, setFilterAssignee] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  const load = async () => {
    if (!isAuthenticated) return;
    setPageLoading(true);
    const [t, p, pr] = await Promise.all([
      supabase.from("tasks").select("*").order("position"),
      supabase.from("profiles").select("id,full_name,contract_type"),
      supabase.from("projects").select("id,name,color").eq("archived", false),
    ]);
    setTasks((t.data ?? []) as TaskRow[]);
    setProfiles((p.data ?? []) as ProfileLite[]);
    setProjects((pr.data ?? []) as ProjectLite[]);
    setPageLoading(false);
  };

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      setPageLoading(false);
      return;
    }
    void load();
  }, [loading, isAuthenticated]);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterProject !== "all" && t.project_id !== filterProject) return false;
      if (filterAssignee !== "all" && t.assignee_id !== filterAssignee) return false;
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
      return true;
    });
  }, [tasks, search, filterProject, filterAssignee, filterPriority]);

  const profileById = (id: string | null) => profiles.find((p) => p.id === id);
  const projectById = (id: string | null) => projects.find((p) => p.id === id);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  if (pageLoading || loading) {
    return <div className="p-6 text-muted-foreground">Carregando tarefas...</div>;
  }

  const onDragEnd = async (e: DragEndEvent) => {
    if (!e.over) return;
    const taskId = String(e.active.id);
    const newStatus = String(e.over.id) as TaskRow["status"];
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;
    const previousStatus = task.status;
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
    const update: { status: TaskRow["status"]; completed_at?: string } = { status: newStatus };
    if (newStatus === "done") update.completed_at = new Date().toISOString();
    const { error } = await supabase.from("tasks").update(update).eq("id", taskId);
    if (error) {
      toast.error(error.message);
      void load();
      return;
    }
    if (user) {
      const updated = { ...task, status: newStatus };
      void runAutomations({
        trigger: "status_changed",
        task: updated as unknown as Record<string, unknown>,
        previousStatus,
        userId: user.id,
        userName: profile?.full_name ?? undefined,
      });
      if (newStatus === "done") {
        void runAutomations({
          trigger: "task_completed",
          task: updated as unknown as Record<string, unknown>,
          userId: user.id,
          userName: profile?.full_name ?? undefined,
        });
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tarefas</h1>
          <p className="text-sm text-muted-foreground">Gerencie tudo em um Kanban ou em lista.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border bg-background p-0.5">
            <Button
              variant={view === "kanban" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setView("kanban")}
            >
              <KanbanSquare className="h-4 w-4 mr-1" /> Kanban
            </Button>
            <Button
              variant={view === "list" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setView("list")}
            >
              <ListIcon className="h-4 w-4 mr-1" /> Lista
            </Button>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nova tarefa
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-3 flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="pl-8" />
          </div>
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Projeto" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os projetos</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterAssignee} onValueChange={setFilterAssignee}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Responsável" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.full_name ?? "—"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Prioridade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {view === "kanban" ? (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {STATUS_ORDER.map((s) => (
              <KanbanColumn key={s} status={s} tasks={filtered.filter((t) => t.status === s)}
                profileById={profileById} projectById={projectById} />
            ))}
          </div>
        </DndContext>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="p-3 font-medium">Tarefa</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium">Prioridade</th>
                  <th className="p-3 font-medium">Projeto</th>
                  <th className="p-3 font-medium">Responsável</th>
                  <th className="p-3 font-medium">Prazo</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const proj = projectById(t.project_id);
                  const assignee = profileById(t.assignee_id);
                  return (
                    <tr key={t.id} className="border-t hover:bg-muted/30">
                      <td className="p-3">
                        <Link to="/tasks/$taskId" params={{ taskId: t.id }} className="font-medium hover:underline">
                          {t.title}
                        </Link>
                        {t.parent_task_id && (
                          <div className="mt-1 text-xs text-muted-foreground">Subtarefa</div>
                        )}
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className={cn("border", STATUS_COLOR[t.status])}>
                          {STATUS_LABEL[t.status]}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <Badge className={PRIORITY_COLOR[t.priority]}>{PRIORITY_LABEL[t.priority]}</Badge>
                      </td>
                      <td className="p-3">
                        {proj ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full" style={{ background: proj.color ?? "#3b82f6" }} />
                            {proj.name}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="p-3">{assignee?.full_name ?? "—"}</td>
                      <td className={cn("p-3", isOverdue(t.due_date) && t.status !== "done" && "text-rose-600")}>
                        {formatDate(t.due_date)}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nenhuma tarefa.</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

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

function KanbanColumn({
  status, tasks, profileById, projectById,
}: {
  status: TaskStatus;
  tasks: TaskRow[];
  profileById: (id: string | null) => ProfileLite | undefined;
  projectById: (id: string | null) => ProjectLite | undefined;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-lg border bg-background p-2 flex flex-col min-h-[200px]",
        isOver && "ring-2 ring-primary",
      )}
    >
      <div className="px-2 py-1.5 flex items-center justify-between">
        <div className="text-sm font-semibold">{STATUS_LABEL[status]}</div>
        <span className="text-xs text-muted-foreground">{tasks.length}</span>
      </div>
      <div className="space-y-2 mt-1 flex-1">
        {tasks.map((t) => (
          <KanbanCard key={t.id} task={t} profileById={profileById} projectById={projectById} />
        ))}
      </div>
    </div>
  );
}

function KanbanCard({
  task, profileById, projectById,
}: {
  task: TaskRow;
  profileById: (id: string | null) => ProfileLite | undefined;
  projectById: (id: string | null) => ProjectLite | undefined;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const proj = projectById(task.project_id);
  const assignee = profileById(task.assignee_id);
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        "rounded-md border bg-card p-3 shadow-sm cursor-grab active:cursor-grabbing space-y-2",
        isDragging && "opacity-50",
      )}
    >
      <Link
        to="/tasks/$taskId"
        params={{ taskId: task.id }}
        className="block text-sm font-medium hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {task.title}
      </Link>
      {task.parent_task_id && <div className="text-[11px] text-muted-foreground">Subtarefa</div>}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge className={cn("text-[10px] py-0", PRIORITY_COLOR[task.priority])}>{PRIORITY_LABEL[task.priority]}</Badge>
        {proj && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: proj.color ?? "#3b82f6" }} />
            {proj.name}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between">
        <span className={cn("text-[11px] text-muted-foreground", isOverdue(task.due_date) && task.status !== "done" && "text-rose-600")}>
          {task.due_date ? formatDate(task.due_date) : ""}
        </span>
        {assignee && (
          <Avatar className="h-6 w-6"><AvatarFallback className="text-[10px]">{initials(assignee.full_name)}</AvatarFallback></Avatar>
        )}
      </div>
    </div>
  );
}
