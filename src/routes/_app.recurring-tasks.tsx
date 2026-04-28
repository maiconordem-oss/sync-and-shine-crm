import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Edit3, Trash2, Repeat } from "lucide-react";
import { PRIORITY_LABEL } from "@/lib/labels";

export const Route = createFileRoute("/_app/recurring-tasks")({
  component: RecurringTasksPage,
});

type Recurring = {
  id: string;
  title: string;
  description: string | null;
  project_id: string | null;
  assignee_id: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  task_type: "internal" | "external";
  service_value: number | null;
  day_of_month: number;
  due_offset_days: number;
  active: boolean;
  last_generated_month: string | null;
};

type Project = { id: string; name: string };
type Profile = { id: string; full_name: string | null; contract_type: "clt" | "pj" | null };

function RecurringTasksPage() {
  const { user, isManagerOrAdmin } = useAuth();
  const [items, setItems] = useState<Recurring[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Recurring | null>(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const [r, p, pr] = await Promise.all([
      (supabase.from("recurring_tasks" as never) as any).select("*").order("day_of_month"),
      supabase.from("projects").select("id,name").eq("archived", false).order("name"),
      supabase.from("profiles").select("id,full_name,contract_type").order("full_name"),
    ]);
    if (r.error) toast.error(r.error.message);
    setItems((r.data as Recurring[]) ?? []);
    setProjects((p.data as Project[]) ?? []);
    setProfiles((pr.data as Profile[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  if (!isManagerOrAdmin) {
    return <div className="text-muted-foreground">Apenas Admin e Gestor podem gerenciar tarefas recorrentes.</div>;
  }

  const onDelete = async (id: string) => {
    if (!confirm("Excluir este modelo recorrente?")) return;
    const { error } = await (supabase.from("recurring_tasks" as never) as any).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Removido");
    void load();
  };

  const toggleActive = async (id: string, active: boolean) => {
    const { error } = await (supabase.from("recurring_tasks" as never) as any).update({ active }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    void load();
  };

  return (
    <div className="flex flex-col gap-4 min-h-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Repeat className="h-6 w-6" /> Tarefas recorrentes</h1>
          <p className="text-sm text-muted-foreground">Modelos que geram uma tarefa automaticamente todo mês no dia configurado.</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Nova recorrência
        </Button>
      </div>

      <div className="border rounded-lg bg-card overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Dia do mês</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Projeto</TableHead>
              <TableHead>Prioridade</TableHead>
              <TableHead>Última gerada</TableHead>
              <TableHead>Ativa</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>}
            {!loading && items.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhuma tarefa recorrente cadastrada.</TableCell></TableRow>
            )}
            {items.map((it) => {
              const ass = profiles.find((p) => p.id === it.assignee_id);
              const pj = projects.find((p) => p.id === it.project_id);
              return (
                <TableRow key={it.id}>
                  <TableCell className="font-medium">{it.title}</TableCell>
                  <TableCell>Dia {it.day_of_month}</TableCell>
                  <TableCell>{ass?.full_name ?? "—"}</TableCell>
                  <TableCell>{pj?.name ?? "—"}</TableCell>
                  <TableCell>{PRIORITY_LABEL[it.priority]}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{it.last_generated_month ?? "—"}</TableCell>
                  <TableCell><Switch checked={it.active} onCheckedChange={(v) => void toggleActive(it.id, v)} /></TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => { setEditing(it); setOpen(true); }}><Edit3 className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => void onDelete(it.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <RecurringDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        projects={projects}
        profiles={profiles}
        userId={user?.id ?? ""}
        onSaved={() => { setOpen(false); void load(); }}
      />
    </div>
  );
}

function RecurringDialog({
  open, onOpenChange, editing, projects, profiles, userId, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Recurring | null;
  projects: Project[];
  profiles: Profile[];
  userId: string;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("none");
  const [assigneeId, setAssigneeId] = useState("none");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [taskType, setTaskType] = useState<"internal" | "external">("internal");
  const [serviceValue, setServiceValue] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState(5);
  const [dueOffset, setDueOffset] = useState(0);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setDescription(editing.description ?? "");
      setProjectId(editing.project_id ?? "none");
      setAssigneeId(editing.assignee_id ?? "none");
      setPriority(editing.priority);
      setTaskType(editing.task_type);
      setServiceValue(editing.service_value ? String(editing.service_value) : "");
      setDayOfMonth(editing.day_of_month);
      setDueOffset(editing.due_offset_days);
      setActive(editing.active);
    } else {
      setTitle(""); setDescription(""); setProjectId("none"); setAssigneeId("none");
      setPriority("medium"); setTaskType("internal"); setServiceValue("");
      setDayOfMonth(5); setDueOffset(0); setActive(true);
    }
  }, [open, editing]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { toast.error("Informe o título."); return; }
    if (dayOfMonth < 1 || dayOfMonth > 31) { toast.error("Dia do mês entre 1 e 31."); return; }
    setBusy(true);
    const payload = {
      title: title.trim(),
      description: description || null,
      project_id: projectId === "none" ? null : projectId,
      assignee_id: assigneeId === "none" ? null : assigneeId,
      priority,
      task_type: taskType,
      service_value: taskType === "external" && serviceValue ? Number(serviceValue) : null,
      day_of_month: dayOfMonth,
      due_offset_days: dueOffset,
      active,
    };
    const q = editing
      ? (supabase.from("recurring_tasks" as never) as any).update(payload).eq("id", editing.id)
      : (supabase.from("recurring_tasks" as never) as any).insert([{ ...payload, created_by: userId }]);
    const { error } = await q;
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Atualizado" : "Criado");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar" : "Nova"} tarefa recorrente</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Título *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Pagar conta de luz" required />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Dia do mês *</Label>
              <Input type="number" min={1} max={31} value={dayOfMonth} onChange={(e) => setDayOfMonth(Number(e.target.value))} />
              <p className="text-[11px] text-muted-foreground">Se o mês não tiver esse dia, usa o último.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Prazo (dias após gerar)</Label>
              <Input type="number" min={0} value={dueOffset} onChange={(e) => setDueOffset(Number(e.target.value))} />
            </div>

            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select value={assigneeId} onValueChange={(v) => {
                setAssigneeId(v);
                const p = profiles.find((x) => x.id === v);
                if (p?.contract_type === "pj") setTaskType("external");
                else if (p?.contract_type === "clt") setTaskType("internal");
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem responsável</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name ?? "—"}{p.contract_type === "pj" ? " (PJ)" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Projeto</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem projeto</SelectItem>
                  {projects.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_LABEL).map(([k, v]) => (<SelectItem key={k} value={k}>{v}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={taskType} onValueChange={(v) => setTaskType(v as typeof taskType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">Interna (CLT)</SelectItem>
                  <SelectItem value="external">Externa (PJ)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {taskType === "external" && (
              <div className="space-y-1.5 col-span-2">
                <Label>Valor do serviço (R$)</Label>
                <Input type="number" step="0.01" min="0" value={serviceValue} onChange={(e) => setServiceValue(e.target.value)} />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Switch checked={active} onCheckedChange={setActive} />
            <Label className="cursor-pointer">Ativa</Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
