import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TRIGGER_LABEL, ACTION_LABEL } from "@/lib/labels";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

interface AutomationRow {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  conditions: unknown;
  actions: unknown;
  enabled: boolean;
  run_count: number;
  last_run_at: string | null;
}

interface ActionItem { type: string; params: Record<string, unknown> }
interface ConditionItem { field: string; op: string; value: string }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  automation: AutomationRow | null;
  onSaved: () => void;
}

export function AutomationEditorDialog({ open, onOpenChange, automation, onSaved }: Props) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState("task_completed");
  const [conditions, setConditions] = useState<ConditionItem[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([{ type: "create_task", params: { title: "Nova tarefa", due_in_days: 1, priority: "medium" } }]);

  useEffect(() => {
    if (automation) {
      setName(automation.name);
      setDescription(automation.description ?? "");
      setTrigger(automation.trigger_type);
      setConditions((automation.conditions as ConditionItem[]) ?? []);
      setActions((automation.actions as ActionItem[]) ?? []);
    } else {
      setName(""); setDescription(""); setTrigger("task_completed");
      setConditions([]);
      setActions([{ type: "create_task", params: { title: "Nova tarefa", due_in_days: 1, priority: "medium" } }]);
    }
  }, [automation, open]);

  const save = async () => {
    if (!user) return;
    const payload = {
      name,
      description: description || null,
      trigger_type: trigger,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      conditions: conditions as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      actions: actions as any,
    };
    const res = automation
      ? await supabase.from("automations").update(payload).eq("id", automation.id)
      : await supabase.from("automations").insert([{ ...payload, created_by: user.id, enabled: true }]);
    if (res.error) { toast.error(res.error.message); return; }
    toast.success("Salvo!");
    onSaved();
    onOpenChange(false);
  };

  const updateAction = (idx: number, patch: Partial<ActionItem>) => {
    setActions((a) => a.map((x, i) => i === idx ? { ...x, ...patch } : x));
  };
  const updateActionParam = (idx: number, key: string, val: unknown) => {
    setActions((a) => a.map((x, i) => i === idx ? { ...x, params: { ...x.params, [key]: val } } : x));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{automation ? "Editar automação" : "Nova automação"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Notificar gestor ao concluir" />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <Section title="1. Quando (gatilho)">
            <Select value={trigger} onValueChange={setTrigger}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TRIGGER_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </Section>

          <Section title="2. Se (condições — opcional)">
            <div className="space-y-2">
              {conditions.map((c, i) => (
                <div key={i} className="flex gap-2">
                  <Select value={c.field} onValueChange={(v) => setConditions((a) => a.map((x, idx) => idx === i ? { ...x, field: v } : x))}>
                    <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="project_id">Projeto</SelectItem>
                      <SelectItem value="priority">Prioridade</SelectItem>
                      <SelectItem value="assignee_id">Responsável</SelectItem>
                      <SelectItem value="tags">Tag</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={c.op} onValueChange={(v) => setConditions((a) => a.map((x, idx) => idx === i ? { ...x, op: v } : x))}>
                    <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eq">igual a</SelectItem>
                      <SelectItem value="contains">contém</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input className="flex-1" value={c.value} onChange={(e) => setConditions((a) => a.map((x, idx) => idx === i ? { ...x, value: e.target.value } : x))} placeholder="Valor (ID ou texto)" />
                  <Button variant="ghost" size="icon" onClick={() => setConditions((a) => a.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setConditions((a) => [...a, { field: "priority", op: "eq", value: "" }])}>
                <Plus className="h-3 w-3 mr-1" /> Adicionar condição
              </Button>
            </div>
          </Section>

          <Section title="3. Então (ações)">
            <div className="space-y-3">
              {actions.map((a, i) => (
                <div key={i} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Select value={a.type} onValueChange={(v) => updateAction(i, { type: v, params: {} })}>
                      <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(ACTION_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" onClick={() => setActions((arr) => arr.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  <ActionParams action={a} onParam={(k, v) => updateActionParam(i, k, v)} />
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setActions((arr) => [...arr, { type: "notify_user", params: {} }])}>
                <Plus className="h-3 w-3 mr-1" /> Adicionar ação
              </Button>
            </div>
          </Section>

          <div className="rounded-md bg-muted/50 p-3 text-sm">
            <span className="font-medium">Variáveis disponíveis:</span>{" "}
            <code className="text-xs">{`{{tarefa.titulo}}, {{tarefa.responsavel}}, {{tarefa.projeto}}, {{tarefa.prazo}}, {{usuario.nome}}, {{data.hoje}}, {{data.hoje+3d}}`}</code>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={!name}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="text-sm font-semibold">{title}</div>
      {children}
    </div>
  );
}

function ActionParams({ action, onParam }: { action: ActionItem; onParam: (k: string, v: unknown) => void }) {
  const p = action.params;
  switch (action.type) {
    case "create_task":
      return (
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Título da tarefa" value={String(p.title ?? "")} onChange={(e) => onParam("title", e.target.value)} />
          <Input placeholder="Prazo em dias" type="number" value={String(p.due_in_days ?? "")} onChange={(e) => onParam("due_in_days", Number(e.target.value))} />
          <Input placeholder="ID do responsável (opcional)" value={String(p.assignee_id ?? "")} onChange={(e) => onParam("assignee_id", e.target.value)} />
          <Input placeholder="Prioridade (low/medium/high/urgent)" value={String(p.priority ?? "medium")} onChange={(e) => onParam("priority", e.target.value)} />
        </div>
      );
    case "assign_user":
      return <Input placeholder="ID do usuário" value={String(p.user_id ?? "")} onChange={(e) => onParam("user_id", e.target.value)} />;
    case "change_status":
      return (
        <Select value={String(p.status ?? "in_progress")} onValueChange={(v) => onParam("status", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="new">Nova</SelectItem>
            <SelectItem value="in_progress">Em andamento</SelectItem>
            <SelectItem value="waiting">Aguardando</SelectItem>
            <SelectItem value="done">Concluída</SelectItem>
            <SelectItem value="deferred">Adiada</SelectItem>
          </SelectContent>
        </Select>
      );
    case "add_comment":
      return <Textarea placeholder="Conteúdo do comentário" value={String(p.content ?? "")} onChange={(e) => onParam("content", e.target.value)} rows={2} />;
    case "notify_user":
      return (
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="ID do usuário a notificar" value={String(p.user_id ?? "")} onChange={(e) => onParam("user_id", e.target.value)} />
          <Input placeholder="Título" value={String(p.title ?? "")} onChange={(e) => onParam("title", e.target.value)} />
          <Textarea className="col-span-2" placeholder="Corpo (opcional)" value={String(p.body ?? "")} onChange={(e) => onParam("body", e.target.value)} rows={2} />
        </div>
      );
    case "create_payment":
      return (
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Descrição" value={String(p.description ?? "")} onChange={(e) => onParam("description", e.target.value)} />
          <Input placeholder="Valor (R$)" type="number" step="0.01" value={String(p.amount ?? "")} onChange={(e) => onParam("amount", Number(e.target.value))} />
          <Input placeholder="Vencimento (dias)" type="number" value={String(p.due_in_days ?? "")} onChange={(e) => onParam("due_in_days", Number(e.target.value))} />
          <Input placeholder="ID do beneficiário (opcional)" value={String(p.beneficiary_user_id ?? "")} onChange={(e) => onParam("beneficiary_user_id", e.target.value)} />
          <Input className="col-span-2" placeholder="Nome (se externo)" value={String(p.beneficiary_name ?? "")} onChange={(e) => onParam("beneficiary_name", e.target.value)} />
        </div>
      );
    case "webhook":
      return <Input placeholder="https://..." value={String(p.url ?? "")} onChange={(e) => onParam("url", e.target.value)} />;
    case "add_tag":
      return <Input placeholder="Tag" value={String(p.tag ?? "")} onChange={(e) => onParam("tag", e.target.value)} />;
    default:
      return null;
  }
}
