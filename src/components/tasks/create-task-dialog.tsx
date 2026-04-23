import { useEffect, useMemo, useState } from "react";
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
import { Briefcase, CheckCircle2, ClipboardCheck, CreditCard, PenSquare } from "lucide-react";

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
  const [referenceUrl, setReferenceUrl] = useState("");
  const [projectId, setProjectId] = useState<string>(defaultProjectId ?? "none");
  const [assigneeId, setAssigneeId] = useState<string>("none");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [dueDate, setDueDate] = useState("");
  const [taskType, setTaskType] = useState<"internal" | "external">("internal");
  const [serviceValue, setServiceValue] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setAssigneeId((current) => (current === "none" ? user.id : current));
    setProjectId(defaultProjectId ?? "none");
  }, [defaultProjectId, open, user]);

  const selectedAssignee = useMemo(
    () => profiles.find((person) => person.id === (assigneeId === "none" ? null : assigneeId)),
    [assigneeId, profiles],
  );

  const flowSteps = taskType === "external"
    ? [
        { label: "Criar", icon: PenSquare },
        { label: "Executar", icon: Briefcase },
        { label: "Revisão", icon: ClipboardCheck },
        { label: "Aprovar", icon: CheckCircle2 },
        { label: "Pagamento", icon: CreditCard },
      ]
    : [
        { label: "Criar", icon: PenSquare },
        { label: "Executar", icon: Briefcase },
        { label: "Concluir", icon: CheckCircle2 },
      ];

  const reset = () => {
    setTitle(""); setDescription(""); setAssigneeId("none");
    setProjectId(defaultProjectId ?? "none"); setPriority("medium"); setDueDate("");
    setTaskType("internal"); setServiceValue(""); setReferenceUrl("");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("Você precisa estar logado para criar uma tarefa.");
      return;
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error("Informe um título para a tarefa.");
      return;
    }

    if (taskType === "external" && !serviceValue) {
      toast.error("Informe o valor do serviço para tarefas externas.");
      return;
    }

    setBusy(true);
    const payload = {
      title: trimmedTitle,
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
          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="text-sm font-medium">Fluxo previsto</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-5">
              {flowSteps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <div key={step.label} className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
                    <div className="grid h-8 w-8 place-items-center rounded-md bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">Etapa {index + 1}</div>
                      <div className="font-medium">{step.label}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {taskType === "external"
                ? "Tarefas externas passam por revisão de Admin ou Gestor antes de liberar o pagamento."
                : "Tarefas internas seguem direto até a conclusão, sem etapa de pagamento."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Título *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label>Link de referência</Label>
            <Input
              type="url"
              value={referenceUrl}
              onChange={(e) => setReferenceUrl(e.target.value)}
              placeholder="https://..."
            />
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
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name ?? "—"}{p.contract_type === "pj" ? " (PJ)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
                <p className="text-xs text-muted-foreground">
                  {selectedAssignee
                    ? `Responsável atual: ${selectedAssignee.full_name ?? "Sem nome"}${selectedAssignee.contract_type === "pj" ? " • fluxo com revisão e pagamento" : " • fluxo interno"}`
                    : "Escolha um responsável para testar o fluxo completo da tarefa."}
                </p>
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
            <div className="space-y-1.5">
              <Label>Tipo de tarefa</Label>
              <Select value={taskType} onValueChange={(v) => setTaskType(v as typeof taskType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">Interna (CLT)</SelectItem>
                  <SelectItem value="external">Externa (PJ — remunerada)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {taskType === "external" && (
              <div className="space-y-1.5 col-span-2">
                <Label>Valor do serviço (R$)</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={serviceValue}
                  onChange={(e) => setServiceValue(e.target.value)}
                  placeholder="Ex: 50.00 — gera pagamento ao concluir"
                />
                <p className="text-xs text-muted-foreground">Ao concluir a tarefa, será criado um pagamento pendente para o responsável.</p>
              </div>
            )}
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
