import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, Plus, Send, Trash2, Play, Square } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { runAutomations } from "@/lib/automations";
import { toast } from "sonner";
import { initials, formatDate, formatDateTime } from "@/lib/format";
import { PRIORITY_LABEL, STATUS_LABEL, PRIORITY_COLOR } from "@/lib/labels";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";

type TaskStatus = "new" | "in_progress" | "waiting" | "done" | "deferred";
type TaskPriority = "low" | "medium" | "high" | "urgent";

interface TaskFull {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string | null;
  project_id: string | null;
  created_by: string | null;
  due_date: string | null;
  start_date: string | null;
  estimated_hours: number | null;
  tags: string[] | null;
  parent_task_id: string | null;
  completed_at: string | null;
}

export const Route = createFileRoute("/_app/tasks/$taskId")({
  component: TaskDetailPage,
});

function TaskDetailPage() {
  const { taskId } = useParams({ from: "/_app/tasks/$taskId" });
  const { user, profile } = useAuth();
  const [task, setTask] = useState<TaskFull | null>(null);
  const [profiles, setProfiles] = useState<{ id: string; full_name: string | null }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [subtasks, setSubtasks] = useState<TaskFull[]>([]);
  const [comments, setComments] = useState<{ id: string; content: string; author_id: string | null; created_at: string }[]>([]);
  const [checklist, setChecklist] = useState<{ id: string; text: string; done: boolean }[]>([]);
  const [timeEntries, setTimeEntries] = useState<{ id: string; user_id: string; started_at: string; ended_at: string | null; duration_minutes: number | null }[]>([]);
  const [newComment, setNewComment] = useState("");
  const [newChecklist, setNewChecklist] = useState("");
  const [createSubOpen, setCreateSubOpen] = useState(false);
  const [activeTimer, setActiveTimer] = useState<string | null>(null);

  const load = async () => {
    const [t, p, pr, sub, c, ch, te] = await Promise.all([
      supabase.from("tasks").select("*").eq("id", taskId).maybeSingle(),
      supabase.from("profiles").select("id,full_name"),
      supabase.from("projects").select("id,name"),
      supabase.from("tasks").select("*").eq("parent_task_id", taskId),
      supabase.from("comments").select("*").eq("task_id", taskId).order("created_at"),
      supabase.from("checklists").select("*").eq("task_id", taskId).order("position"),
      supabase.from("time_entries").select("*").eq("task_id", taskId).order("started_at", { ascending: false }),
    ]);
    setTask((t.data as TaskFull) ?? null);
    setProfiles((p.data ?? []) as { id: string; full_name: string | null }[]);
    setProjects((pr.data ?? []) as { id: string; name: string }[]);
    setSubtasks((sub.data ?? []) as TaskFull[]);
    setComments((c.data ?? []) as { id: string; content: string; author_id: string | null; created_at: string }[]);
    setChecklist((ch.data ?? []) as { id: string; text: string; done: boolean }[]);
    setTimeEntries((te.data ?? []) as typeof timeEntries);
    const open = (te.data ?? []).find((x) => x.user_id === user?.id && !x.ended_at);
    setActiveTimer(open?.id ?? null);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [taskId]);

  const update = async (patch: Partial<TaskFull>) => {
    if (!task) return;
    const previousStatus = task.status;
    const previousAssignee = task.assignee_id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await supabase.from("tasks").update(patch as any).eq("id", task.id).select().single();
    if (error) { toast.error(error.message); return; }
    const updated = data as TaskFull;
    setTask(updated);
    if (user) {
      if (patch.status && patch.status !== previousStatus) {
        void runAutomations({
          trigger: "status_changed",
          task: updated as unknown as Record<string, unknown>,
          previousStatus,
          userId: user.id,
          userName: profile?.full_name ?? undefined,
        });
        if (patch.status === "done") {
          void runAutomations({
            trigger: "task_completed",
            task: updated as unknown as Record<string, unknown>,
            userId: user.id,
            userName: profile?.full_name ?? undefined,
          });
        }
      }
      if (patch.assignee_id !== undefined && patch.assignee_id !== previousAssignee) {
        void runAutomations({
          trigger: "assignee_changed",
          task: updated as unknown as Record<string, unknown>,
          previousAssignee,
          userId: user.id,
          userName: profile?.full_name ?? undefined,
        });
      }
    }
  };

  const addComment = async () => {
    if (!user || !newComment.trim()) return;
    const { data, error } = await supabase.from("comments").insert([{
      task_id: taskId, author_id: user.id, content: newComment.trim(),
    }]).select().single();
    if (error) { toast.error(error.message); return; }
    setComments((c) => [...c, data as typeof comments[number]]);
    setNewComment("");
    if (task) {
      void runAutomations({
        trigger: "comment_added",
        task: task as unknown as Record<string, unknown>,
        comment: { content: newComment.trim(), author_id: user.id },
        userId: user.id,
        userName: profile?.full_name ?? undefined,
      });
    }
  };

  const addChecklist = async () => {
    if (!newChecklist.trim()) return;
    const { data, error } = await supabase.from("checklists").insert([{
      task_id: taskId, text: newChecklist.trim(), position: checklist.length,
    }]).select().single();
    if (error) { toast.error(error.message); return; }
    setChecklist((c) => [...c, data as typeof checklist[number]]);
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

  const startTimer = async () => {
    if (!user) return;
    const { data, error } = await supabase.from("time_entries").insert([{
      task_id: taskId, user_id: user.id, started_at: new Date().toISOString(),
    }]).select().single();
    if (error) { toast.error(error.message); return; }
    setActiveTimer(data.id);
    setTimeEntries((t) => [data as typeof timeEntries[number], ...t]);
  };

  const stopTimer = async () => {
    if (!activeTimer) return;
    const entry = timeEntries.find((t) => t.id === activeTimer);
    if (!entry) return;
    const ended = new Date();
    const minutes = Math.round((ended.getTime() - new Date(entry.started_at).getTime()) / 60000);
    await supabase.from("time_entries").update({ ended_at: ended.toISOString(), duration_minutes: minutes }).eq("id", activeTimer);
    setActiveTimer(null);
    void load();
  };

  const totalMin = timeEntries.reduce((s, t) => s + (t.duration_minutes ?? 0), 0);

  if (!task) return <div className="p-6 text-muted-foreground">Carregando...</div>;

  const profileById = (id: string | null) => profiles.find((p) => p.id === id);

  return (
    <div className="space-y-4 max-w-5xl">
      <Link to="/tasks" className="inline-flex items-center text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
      </Link>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <Input
                value={task.title}
                onChange={(e) => setTask({ ...task, title: e.target.value })}
                onBlur={(e) => void update({ title: e.target.value })}
                className="text-xl font-semibold border-0 px-0 focus-visible:ring-0 shadow-none"
              />
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={task.description ?? ""}
                onChange={(e) => setTask({ ...task, description: e.target.value })}
                onBlur={(e) => void update({ description: e.target.value })}
                placeholder="Descrição..."
                rows={4}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Subtarefas</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setCreateSubOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar
              </Button>
            </CardHeader>
            <CardContent>
              {subtasks.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma subtarefa.</p> : (
                <ul className="space-y-1">
                  {subtasks.map((s) => (
                    <li key={s.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                      <Link to="/tasks/$taskId" params={{ taskId: s.id }} className="hover:underline text-sm">
                        {s.title}
                      </Link>
                      <Badge variant="outline">{STATUS_LABEL[s.status]}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Checklist</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {checklist.map((c) => (
                <div key={c.id} className="flex items-center gap-2 group">
                  <Checkbox checked={c.done} onCheckedChange={(v) => toggleChecklist(c.id, !!v)} />
                  <span className={c.done ? "line-through text-muted-foreground flex-1 text-sm" : "flex-1 text-sm"}>{c.text}</span>
                  <Button variant="ghost" size="icon" onClick={() => deleteChecklist(c.id)} className="opacity-0 group-hover:opacity-100">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2 pt-2">
                <Input value={newChecklist} onChange={(e) => setNewChecklist(e.target.value)}
                  placeholder="Novo item..." onKeyDown={(e) => e.key === "Enter" && addChecklist()} />
                <Button onClick={addChecklist} variant="secondary">Adicionar</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Comentários</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {comments.map((c) => {
                const author = profileById(c.author_id);
                return (
                  <div key={c.id} className="flex gap-3">
                    <Avatar className="h-8 w-8"><AvatarFallback className="text-xs">{initials(author?.full_name)}</AvatarFallback></Avatar>
                    <div className="flex-1">
                      <div className="text-sm">
                        <span className="font-medium">{author?.full_name ?? "—"}</span>
                        <span className="text-muted-foreground ml-2 text-xs">{formatDateTime(c.created_at)}</span>
                      </div>
                      <p className="text-sm mt-0.5 whitespace-pre-wrap">{c.content}</p>
                    </div>
                  </div>
                );
              })}
              <div className="flex gap-2 pt-2">
                <Textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Comentar..." rows={2} />
                <Button onClick={addComment} disabled={!newComment.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Detalhes</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Field label="Status">
                <Select value={task.status} onValueChange={(v) => void update({ status: v as TaskStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Prioridade">
                <Select value={task.priority} onValueChange={(v) => void update({ priority: v as TaskPriority })}>
                  <SelectTrigger>
                    <SelectValue>
                      <Badge className={PRIORITY_COLOR[task.priority]}>{PRIORITY_LABEL[task.priority]}</Badge>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITY_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Responsável">
                <Select value={task.assignee_id ?? "none"} onValueChange={(v) => void update({ assignee_id: v === "none" ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem responsável</SelectItem>
                    {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name ?? "—"}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Projeto">
                <Select value={task.project_id ?? "none"} onValueChange={(v) => void update({ project_id: v === "none" ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem projeto</SelectItem>
                    {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Prazo">
                <Input
                  type="date"
                  value={task.due_date ? task.due_date.slice(0, 10) : ""}
                  onChange={(e) => void update({ due_date: e.target.value ? new Date(e.target.value).toISOString() : null })}
                />
              </Field>
              <Field label="Horas estimadas">
                <Input
                  type="number" step="0.25"
                  value={task.estimated_hours ?? ""}
                  onChange={(e) => setTask({ ...task, estimated_hours: e.target.value ? Number(e.target.value) : null })}
                  onBlur={(e) => void update({ estimated_hours: e.target.value ? Number(e.target.value) : null })}
                />
              </Field>
              <div className="text-xs text-muted-foreground pt-2">
                Criada em {formatDate(task.completed_at ?? undefined)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Tempo</CardTitle>
              {activeTimer ? (
                <Button size="sm" variant="destructive" onClick={stopTimer}>
                  <Square className="h-3 w-3 mr-1" /> Parar
                </Button>
              ) : (
                <Button size="sm" onClick={startTimer}>
                  <Play className="h-3 w-3 mr-1" /> Iniciar
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{Math.floor(totalMin / 60)}h {totalMin % 60}m</div>
              <p className="text-xs text-muted-foreground">Total registrado</p>
              {timeEntries.length > 0 && (
                <ul className="mt-3 text-xs space-y-1">
                  {timeEntries.slice(0, 5).map((t) => (
                    <li key={t.id} className="flex justify-between">
                      <span>{profileById(t.user_id)?.full_name ?? "—"}</span>
                      <span>{t.duration_minutes ? `${t.duration_minutes}m` : "em curso..."}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <CreateTaskDialog
        open={createSubOpen}
        onOpenChange={setCreateSubOpen}
        projects={projects}
        profiles={profiles}
        parentTaskId={taskId}
        defaultProjectId={task.project_id ?? undefined}
        onCreated={() => void load()}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}
