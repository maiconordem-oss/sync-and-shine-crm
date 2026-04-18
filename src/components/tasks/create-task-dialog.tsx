import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { runAutomations } from "@/lib/automations";
import { toast } from "sonner";
import { PRIORITY_LABEL } from "@/lib/labels";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projects: { id: string; name: string }[];
  profiles: { id: string; full_name: string | null; contract_type?: "clt" | "pj" | null }[];
  parentTaskId?: string;
  defaultProjectId?: string;
  onCreated?: () => void;
}

export function CreateTaskDialog({ open, onOpenChange, projects, profiles, parentTaskId, defaultProjectId, onCreated }: Props) {
  const { user, profile } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string>(defaultProjectId ?? "none");
  const [assigneeId, setAssigneeId] = useState<string>("none");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [dueDate, setDueDate] = useState("");
  const [taskType, setTaskType] = useState<"internal" | "external">("internal");
  const [serviceValue, setServiceValue] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setTitle(""); setDescription(""); setAssigneeId("none");
    setProjectId(defaultProjectId ?? "none"); setPriority("medium"); setDueDate("");
    setTaskType("internal"); setServiceValue("");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const payload = {
      title,
      description: description || null,
      project_id: projectId === "none" ? null : projectId,
      assignee_id: assigneeId === "none" ? null : assigneeId,
      priority,
      status: "new" as const,
      due_date: dueDate ? new Date(dueDate).toISOString() : null,
      created_by: user.id,
      parent_task_id: parentTaskId ?? null,
      task_type: taskType,
      service_value: taskType === "external" && serviceValue ? Number(serviceValue) : null,
    };
    const { data, error } = await supabase.from("tasks").insert([payload]).select().single();
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Tarefa criada!");
    reset();
    onOpenChange(false);
    onCreated?.();
    void runAutomations({
      trigger: "task_created",
      task: data as unknown as Record<string, unknown>,
      userId: user.id,
      userName: profile?.full_name ?? undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{parentTaskId ? "Nova subtarefa" : "Nova tarefa"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Título *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Projeto</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem projeto</SelectItem>
                  {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem responsável</SelectItem>
                  {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name ?? "—"}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Prazo</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={busy || !title}>Criar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
