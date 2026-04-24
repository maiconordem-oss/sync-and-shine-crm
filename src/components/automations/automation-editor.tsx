import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TRIGGER_LABEL, ACTION_LABEL } from "@/lib/labels";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Plus, Trash2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [actions, setActions] = useState<ActionItem[]>([{
    type: "create_payment",
    params: { description: "Pagamento ref. tarefa: {{tarefa.titulo}}", use_task_value: true, due_in_days: 5 }
  }]);
  const [profiles, setProfiles] = useState<{ id: string; full_name: string | null }[]>([]);

  useEffect(() => {
    void supabase.from("profiles").select("id,full_name").then(({ data }) => {
      setProfiles((data ?? []) as { id: string; full_name: string | null }[]);
    });
  }, []);

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
      setActions([{ type: "create_payment", params: { description: "Pagamento ref. tarefa: {{tarefa.titulo}}", use_task_value: true, due_in_days: 5 } }]);
    }
  }, [automation, open]);

  const save = async () => {
    if (!user || !name.trim()) return;
    const payload = {
      name: name.trim(),
      description: description || null,
      trigger_type: trigger,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      conditions: conditions as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      actions: actions as any,
    };
    const res = automation
      ? await supabase.from("automations").update(payload).eq("id", automation.id)
      : await supabase.from("automations").insert([{ ...payload, created_by: user.id, enabled: false }]);
    if (res.error) { toast.error(res.error.message); return; }
    toast.success("Automação salva!");
    onSaved();
    onOpenChange(false);
  };

  const updateActionParam = (idx: number, key: string, val: unknown) => {
    setActions((a) => a.map((x, i) => i === idx ? { ...x, params: { ...x.params, [key]: val } } : x));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{automation ? "Editar automação" : "Nova automação"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name + description */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label>Nome *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Registrar pagamento PJ ao concluir tarefa" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Descrição</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Descreva o que esta automação faz..." />
            </div>
          </div>

          {/* Step 1: Trigger */}
          <Section title="1. Quando (gatilho)" color="blue">
            <Select value={trigger} onValueChange={setTrigger}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TRIGGER_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {trigger === "task_completed" && "Dispara quando qualquer tarefa muda o status para 'Concluída'."}
              {trigger === "due_passed" && "Dispara quando a data de prazo de uma tarefa é ultrapassada."}
              {trigger === "status_changed" && "Dispara ao alterar o status de uma tarefa para qualquer estado."}
              {trigger === "assignee_changed" && "Dispara quando o responsável de uma tarefa é alterado."}
              {trigger === "comment_added" && "Dispara quando alguém comenta em uma tarefa."}
              {trigger === "task_created" && "Dispara quando uma nova tarefa é criada."}
            </p>
          </Section>

          {/* Step 2: Conditions */}
          <Section title="2. Se (condições — opcional)" color="amber">
            <div className="space-y-2">
              {conditions.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Sem condições = executa para todas as tarefas com este gatilho.</p>
              )}
              {conditions.map((c, i) => (
                <div key={i} className="flex gap-2">
                  <Select value={c.field} onValueChange={(v) => setConditions((a) => a.map((x, idx) => idx === i ? { ...x, field: v } : x))}>
                    <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="project_id">Projeto (ID)</SelectItem>
                      <SelectItem value="priority">Prioridade</SelectItem>
                      <SelectItem value="assignee_id">Responsável (ID)</SelectItem>
                      <SelectItem value="task_type">Tipo (internal/external)</SelectItem>
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
                  <Input className="flex-1" value={c.value}
                    onChange={(e) => setConditions((a) => a.map((x, idx) => idx === i ? { ...x, value: e.target.value } : x))}
                    placeholder={c.field === "task_type" ? "internal ou external" : c.field === "priority" ? "low, medium, high, urgent" : "Valor..."} />
                  <Button variant="ghost" size="icon" onClick={() => setConditions((a) => a.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setConditions((a) => [...a, { field: "task_type", op: "eq", value: "external" }])}>
                <Plus className="h-3 w-3 mr-1" /> Adicionar condição
              </Button>
            </div>
          </Section>

          {/* Step 3: Actions */}
          <Section title="3. Então (ações)" color="emerald">
            <div className="space-y-3">
              {actions.map((a, i) => (
                <div key={i} className="rounded-lg border bg-background p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <Select value={a.type} onValueChange={(v) => setActions((arr) => arr.map((x, idx) => idx === i ? { type: v, params: getDefaultParams(v) } : x))}>
                      <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(ACTION_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" onClick={() => setActions((arr) => arr.filter((_, idx) => idx !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Rich action params */}
                  <ActionParams action={a} onParam={(k, v) => updateActionParam(i, k, v)} profiles={profiles} />
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setActions((arr) => [...arr, { type: "notify_user", params: getDefaultParams("notify_user") }])}>
                <Plus className="h-3 w-3 mr-1" /> Adicionar ação
              </Button>
            </div>
          </Section>

          {/* Variables reference */}
          <div className="rounded-lg bg-muted/30 p-3 text-xs space-y-1">
            <div className="font-medium flex items-center gap-1"><Info className="h-3.5 w-3.5" /> Variáveis disponíveis</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-muted-foreground font-mono">
              <span>{"{{tarefa.titulo}}"}</span><span className="font-sans text-foreground">Título da tarefa</span>
              <span>{"{{tarefa.valor}}"}</span><span className="font-sans text-foreground">Valor da tarefa (service_value)</span>
              <span>{"{{usuario.nome}}"}</span><span className="font-sans text-foreground">Nome do usuário que disparou</span>
              <span>{"{{data.hoje}}"}</span><span className="font-sans text-foreground">Data de hoje (YYYY-MM-DD)</span>
              <span>{"{{data.hoje+3d}}"}</span><span className="font-sans text-foreground">Daqui 3 dias</span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={!name.trim()}>Salvar automação</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getDefaultParams(type: string): Record<string, unknown> {
  switch (type) {
    case "create_payment": return { description: "Pagamento ref. tarefa: {{tarefa.titulo}}", use_task_value: true, due_in_days: 5 };
    case "create_task": return { title: "Nova tarefa após: {{tarefa.titulo}}", due_in_days: 3, priority: "medium" };
    case "notify_user": return { title: "Notificação: {{tarefa.titulo}}", body: "" };
    case "add_comment": return { content: "" };
    case "change_status": return { status: "in_progress" };
    case "webhook": return { url: "" };
    case "add_tag": return { tag: "" };
    default: return {};
  }
}

function Section({ title, children, color }: { title: string; children: React.ReactNode; color: "blue" | "amber" | "emerald" }) {
  const colors = {
    blue: "border-blue-200 bg-blue-50/50",
    amber: "border-amber-200 bg-amber-50/50",
    emerald: "border-emerald-200 bg-emerald-50/50",
  };
  const titleColors = {
    blue: "text-blue-800",
    amber: "text-amber-800",
    emerald: "text-emerald-800",
  };
  return (
    <div className={cn("rounded-lg border p-3 space-y-2", colors[color])}>
      <div className={cn("text-sm font-semibold", titleColors[color])}>{title}</div>
      {children}
    </div>
  );
}

function ActionParams({
  action, onParam, profiles,
}: {
  action: ActionItem;
  onParam: (k: string, v: unknown) => void;
  profiles: { id: string; full_name: string | null }[];
}) {
  const p = action.params;

  switch (action.type) {
    case "create_payment":
      return (
        <div className="space-y-2">
          {/* Info banner */}
          <div className="rounded-md bg-emerald-50 border border-emerald-200 p-2 text-xs text-emerald-800">
            💡 <strong>Dica:</strong> Ativando "Usar valor da tarefa", o sistema pega automaticamente o <code>service_value</code> da tarefa e atribui ao responsável — não precisa digitar.
          </div>

          <div className="flex items-center justify-between rounded border bg-background px-3 py-2">
            <div>
              <div className="text-sm font-medium">Usar valor da tarefa automaticamente</div>
              <div className="text-xs text-muted-foreground">Pega o service_value e o responsável da tarefa</div>
            </div>
            <Switch
              checked={!!p.use_task_value}
              onCheckedChange={(v) => onParam("use_task_value", v)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Descrição do pagamento</Label>
            <Input
              value={String(p.description ?? "")}
              onChange={(e) => onParam("description", e.target.value)}
              placeholder="Pagamento ref. tarefa: {{tarefa.titulo}}"
            />
          </div>

          {!p.use_task_value && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Valor (R$)</Label>
                <Input type="number" step="0.01" min="0"
                  value={String(p.amount ?? "")}
                  onChange={(e) => onParam("amount", Number(e.target.value))}
                  placeholder="Ex: 150.00" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Beneficiário</Label>
                <Select value={String(p.beneficiary_user_id ?? "auto")} onValueChange={(v) => onParam("beneficiary_user_id", v === "auto" ? "" : v)}>
                  <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto" className="text-xs">Responsável da tarefa (automático)</SelectItem>
                    {profiles.map((pr) => <SelectItem key={pr.id} value={pr.id} className="text-xs">{pr.full_name ?? pr.id}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Vencimento (dias a partir de hoje)</Label>
            <Input type="number" min="0"
              value={String(p.due_in_days ?? "")}
              onChange={(e) => onParam("due_in_days", Number(e.target.value))}
              placeholder="Ex: 5" />
          </div>
        </div>
      );

    case "create_task":
      return (
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Título da nova tarefa</Label>
            <Input value={String(p.title ?? "")} onChange={(e) => onParam("title", e.target.value)}
              placeholder="Próxima etapa: {{tarefa.titulo}}" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Prazo (dias)</Label>
            <Input type="number" value={String(p.due_in_days ?? "")} onChange={(e) => onParam("due_in_days", Number(e.target.value))} placeholder="3" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Prioridade</Label>
            <Select value={String(p.priority ?? "medium")} onValueChange={(v) => onParam("priority", v)}>
              <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low" className="text-xs">Baixa</SelectItem>
                <SelectItem value="medium" className="text-xs">Média</SelectItem>
                <SelectItem value="high" className="text-xs">Alta</SelectItem>
                <SelectItem value="urgent" className="text-xs">Urgente</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Responsável (opcional)</Label>
            <Select value={String(p.assignee_id ?? "none")} onValueChange={(v) => onParam("assignee_id", v === "none" ? "" : v)}>
              <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">Sem responsável</SelectItem>
                {profiles.map((pr) => <SelectItem key={pr.id} value={pr.id} className="text-xs">{pr.full_name ?? pr.id}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      );

    case "assign_user":
      return (
        <div className="space-y-1">
          <Label className="text-xs">Usuário a atribuir</Label>
          <Select value={String(p.user_id ?? "none")} onValueChange={(v) => onParam("user_id", v === "none" ? "" : v)}>
            <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none" className="text-xs">Selecionar...</SelectItem>
              {profiles.map((pr) => <SelectItem key={pr.id} value={pr.id} className="text-xs">{pr.full_name ?? pr.id}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      );

    case "change_status":
      return (
        <div className="space-y-1">
          <Label className="text-xs">Mudar para status</Label>
          <Select value={String(p.status ?? "in_progress")} onValueChange={(v) => onParam("status", v)}>
            <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="new" className="text-xs">Nova</SelectItem>
              <SelectItem value="in_progress" className="text-xs">Em andamento</SelectItem>
              <SelectItem value="waiting" className="text-xs">Aguardando</SelectItem>
              <SelectItem value="in_review" className="text-xs">Em revisão</SelectItem>
              <SelectItem value="done" className="text-xs">Concluída</SelectItem>
              <SelectItem value="deferred" className="text-xs">Adiada</SelectItem>
            </SelectContent>
          </Select>
        </div>
      );

    case "add_comment":
      return (
        <div className="space-y-1">
          <Label className="text-xs">Conteúdo do comentário</Label>
          <Textarea value={String(p.content ?? "")} onChange={(e) => onParam("content", e.target.value)}
            rows={2} placeholder="Ex: ✅ Concluída por {{usuario.nome}} em {{data.hoje}}" />
        </div>
      );

    case "notify_user":
      return (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">Notificar usuário</Label>
            <Select value={String(p.user_id ?? "assignee")} onValueChange={(v) => onParam("user_id", v)}>
              <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="assignee" className="text-xs">Responsável da tarefa</SelectItem>
                <SelectItem value="creator" className="text-xs">Criador da tarefa</SelectItem>
                {profiles.map((pr) => <SelectItem key={pr.id} value={pr.id} className="text-xs">{pr.full_name ?? pr.id}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Título da notificação</Label>
            <Input value={String(p.title ?? "")} onChange={(e) => onParam("title", e.target.value)}
              placeholder="⚠️ Tarefa em atraso: {{tarefa.titulo}}" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Mensagem (opcional)</Label>
            <Textarea value={String(p.body ?? "")} onChange={(e) => onParam("body", e.target.value)}
              rows={2} placeholder="Detalhe adicional..." />
          </div>
        </div>
      );

    case "webhook":
      return (
        <div className="space-y-1">
          <Label className="text-xs">URL do webhook</Label>
          <Input value={String(p.url ?? "")} onChange={(e) => onParam("url", e.target.value)} placeholder="https://..." />
          <p className="text-xs text-muted-foreground">Envia um POST com os dados da tarefa para esta URL.</p>
        </div>
      );

    case "add_tag":
      return (
        <div className="space-y-1">
          <Label className="text-xs">Tag a adicionar</Label>
          <Input value={String(p.tag ?? "")} onChange={(e) => onParam("tag", e.target.value)} placeholder="Ex: pago, revisado, urgente" />
        </div>
      );

    default: return null;
  }
}
