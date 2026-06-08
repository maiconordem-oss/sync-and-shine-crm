import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { Plus, Edit3, Trash2, Repeat, Search, Filter, X } from "lucide-react";
import { PRIORITY_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";


export const Route = createFileRoute("/_app/recurring-tasks")({
  component: RecurringTasksPage,
});

type Frequency = "monthly" | "weekly";

type Recurring = {
  id: string;
  title: string;
  description: string | null;
  project_id: string | null;
  assignee_id: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  task_type: "internal" | "external";
  service_value: number | null;
  frequency: Frequency;
  day_of_month: number | null;
  days_of_week: number[];
  due_offset_days: number;
  active: boolean;
  last_generated_month: string | null;
  last_generated_date: string | null;
};

type Project = { id: string; name: string };
type Profile = { id: string; full_name: string | null; contract_type: "clt" | "pj" | null };

const WEEK_DAYS = [
  { value: 1, short: "Seg", label: "Segunda" },
  { value: 2, short: "Ter", label: "Terça" },
  { value: 3, short: "Qua", label: "Quarta" },
  { value: 4, short: "Qui", label: "Quinta" },
  { value: 5, short: "Sex", label: "Sexta" },
  { value: 6, short: "Sáb", label: "Sábado" },
  { value: 0, short: "Dom", label: "Domingo" },
];

function formatSchedule(it: Recurring) {
  if (it.frequency === "monthly") return `Mensal — dia ${it.day_of_month ?? "?"}`;
  if (!it.days_of_week?.length) return "Semanal — sem dias";
  const labels = WEEK_DAYS.filter((d) => it.days_of_week.includes(d.value)).map((d) => d.short);
  return `Semanal — ${labels.join(", ")}`;
}

function RecurringTasksPage() {
  const { user, isManagerOrAdmin } = useAuth();
  const [items, setItems] = useState<Recurring[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Recurring | null>(null);
  const [open, setOpen] = useState(false);

  // Filtros
  const [search, setSearch] = useState("");
  const [fFreq, setFFreq] = useState<"all" | "monthly" | "weekly">("all");
  const [fStatus, setFStatus] = useState<"all" | "active" | "inactive">("all");
  const [fAssignee, setFAssignee] = useState("all");
  const [fProject, setFProject] = useState("all");
  const [fType, setFType] = useState<"all" | "internal" | "external">("all");
  const [showFilters, setShowFilters] = useState(false);

  const load = async () => {
    setLoading(true);
    const [r, p, pr] = await Promise.all([
      (supabase.from("recurring_tasks" as never) as any).select("*").order("title"),
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

  const hasActiveFilter = fFreq !== "all" || fStatus !== "all" || fAssignee !== "all" || fProject !== "all" || fType !== "all";

  const filtered = useMemo(() => items.filter((it) => {
    if (search) {
      const q = search.toLowerCase();
      const hit = it.title.toLowerCase().includes(q) || (it.description ?? "").toLowerCase().includes(q);
      if (!hit) return false;
    }
    if (fFreq !== "all" && it.frequency !== fFreq) return false;
    if (fStatus === "active" && !it.active) return false;
    if (fStatus === "inactive" && it.active) return false;
    if (fAssignee !== "all" && it.assignee_id !== fAssignee) return false;
    if (fProject !== "all" && it.project_id !== fProject) return false;
    if (fType !== "all" && it.task_type !== fType) return false;
    return true;
  }), [items, search, fFreq, fStatus, fAssignee, fProject, fType]);

  const clearFilters = () => {
    setSearch(""); setFFreq("all"); setFStatus("all");
    setFAssignee("all"); setFProject("all"); setFType("all");
  };

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
          <p className="text-sm text-muted-foreground">
            {filtered.length} de {items.length} modelos · geram tarefas automaticamente (mensal ou em dias da semana).
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Nova recorrência
        </Button>
      </div>

      {/* Busca & filtros */}
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por título ou descrição..." className="pl-9 h-9" />
          {search && <button onClick={() => setSearch("")} className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
        </div>
        <Button variant="outline" size="sm"
          className={cn("h-9", showFilters && "border-primary text-primary")}
          onClick={() => setShowFilters((f) => !f)}>
          <Filter className="h-4 w-4 mr-1" />
          Filtros {hasActiveFilter && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-primary inline-block" />}
        </Button>
        {(hasActiveFilter || search) && (
          <Button variant="ghost" size="sm" className="h-9" onClick={clearFilters}>
            <X className="h-4 w-4 mr-1" /> Limpar
          </Button>
        )}
      </div>

      {showFilters && (
        <div className="flex flex-wrap gap-2 p-3 rounded-lg border bg-muted/20">
          <Select value={fFreq} onValueChange={(v) => setFFreq(v as typeof fFreq)}>
            <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Todas frequências</SelectItem>
              <SelectItem value="monthly" className="text-xs">Mensal</SelectItem>
              <SelectItem value="weekly" className="text-xs">Semanal</SelectItem>
            </SelectContent>
          </Select>
          <Select value={fStatus} onValueChange={(v) => setFStatus(v as typeof fStatus)}>
            <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Todas</SelectItem>
              <SelectItem value="active" className="text-xs">Ativas</SelectItem>
              <SelectItem value="inactive" className="text-xs">Inativas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={fAssignee} onValueChange={setFAssignee}>
            <SelectTrigger className="w-[170px] h-8 text-xs"><SelectValue placeholder="Responsável" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Todos responsáveis</SelectItem>
              {profiles.map((p) => <SelectItem key={p.id} value={p.id} className="text-xs">{p.full_name ?? "—"}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fProject} onValueChange={setFProject}>
            <SelectTrigger className="w-[170px] h-8 text-xs"><SelectValue placeholder="Projeto" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Todos projetos</SelectItem>
              {projects.map((p) => <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fType} onValueChange={(v) => setFType(v as typeof fType)}>
            <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Todos os tipos</SelectItem>
              <SelectItem value="internal" className="text-xs">Interna (CLT)</SelectItem>
              <SelectItem value="external" className="text-xs">Externa (PJ)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="border rounded-lg bg-card overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Recorrência</TableHead>
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
            {!loading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                {items.length === 0 ? "Nenhuma tarefa recorrente cadastrada." : "Nenhum modelo corresponde aos filtros."}
              </TableCell></TableRow>
            )}
            {filtered.map((it) => {
              const ass = profiles.find((p) => p.id === it.assignee_id);
              const pj = projects.find((p) => p.id === it.project_id);
              const lastGen = it.frequency === "monthly" ? it.last_generated_month : it.last_generated_date;
              return (
                <TableRow key={it.id}>
                  <TableCell className="font-medium">{it.title}</TableCell>
                  <TableCell className="text-sm">{formatSchedule(it)}</TableCell>
                  <TableCell>{ass?.full_name ?? "—"}</TableCell>
                  <TableCell>{pj?.name ?? "—"}</TableCell>
                  <TableCell>{PRIORITY_LABEL[it.priority]}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{lastGen ?? "—"}</TableCell>
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
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [dayOfMonth, setDayOfMonth] = useState(5);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5]);
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
      setFrequency(editing.frequency ?? "monthly");
      setDayOfMonth(editing.day_of_month ?? 5);
      setDaysOfWeek(editing.days_of_week ?? []);
      setDueOffset(editing.due_offset_days);
      setActive(editing.active);
    } else {
      setTitle(""); setDescription(""); setProjectId("none"); setAssigneeId("none");
      setPriority("medium"); setTaskType("internal"); setServiceValue("");
      setFrequency("monthly"); setDayOfMonth(5); setDaysOfWeek([1, 2, 3, 4, 5]);
      setDueOffset(0); setActive(true);
    }
  }, [open, editing]);

  const toggleDay = (d: number) => {
    setDaysOfWeek((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort());
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { toast.error("Informe o título."); return; }
    if (frequency === "monthly" && (dayOfMonth < 1 || dayOfMonth > 31)) {
      toast.error("Dia do mês entre 1 e 31."); return;
    }
    if (frequency === "weekly" && daysOfWeek.length === 0) {
      toast.error("Selecione ao menos um dia da semana."); return;
    }
    setBusy(true);
    const payload = {
      title: title.trim(),
      description: description || null,
      project_id: projectId === "none" ? null : projectId,
      assignee_id: assigneeId === "none" ? null : assigneeId,
      priority,
      task_type: taskType,
      service_value: taskType === "external" && serviceValue ? Number(serviceValue) : null,
      frequency,
      day_of_month: frequency === "monthly" ? dayOfMonth : null,
      days_of_week: frequency === "weekly" ? daysOfWeek : [],
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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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

          <div className="space-y-1.5">
            <Label>Frequência *</Label>
            <Select value={frequency} onValueChange={(v) => setFrequency(v as Frequency)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Mensal (dia X do mês)</SelectItem>
                <SelectItem value="weekly">Semanal (dias da semana)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {frequency === "monthly" && (
            <div className="space-y-1.5">
              <Label>Dia do mês *</Label>
              <Input type="number" min={1} max={31} value={dayOfMonth} onChange={(e) => setDayOfMonth(Number(e.target.value))} />
              <p className="text-[11px] text-muted-foreground">Se o mês não tiver esse dia, usa o último.</p>
            </div>
          )}

          {frequency === "weekly" && (
            <div className="space-y-1.5">
              <Label>Dias da semana *</Label>
              <div className="flex flex-wrap gap-1.5">
                {WEEK_DAYS.map((d) => {
                  const selected = daysOfWeek.includes(d.value);
                  return (
                    <button
                      type="button"
                      key={d.value}
                      onClick={() => toggleDay(d.value)}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
                        selected
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-foreground border-input hover:bg-accent"
                      )}
                    >
                      {d.short}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" className="text-[11px] text-primary hover:underline" onClick={() => setDaysOfWeek([1, 2, 3, 4, 5])}>Seg–Sex</button>
                <button type="button" className="text-[11px] text-primary hover:underline" onClick={() => setDaysOfWeek([0, 1, 2, 3, 4, 5, 6])}>Todos</button>
                <button type="button" className="text-[11px] text-muted-foreground hover:underline" onClick={() => setDaysOfWeek([])}>Limpar</button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
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
