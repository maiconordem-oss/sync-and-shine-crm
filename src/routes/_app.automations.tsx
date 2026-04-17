import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Plus, Workflow, Trash2, History, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { TRIGGER_LABEL, ACTION_LABEL } from "@/lib/labels";
import { AutomationEditorDialog } from "@/components/automations/automation-editor";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/automations")({
  component: AutomationsPage,
});

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

interface RunRow {
  id: string;
  automation_id: string;
  status: string;
  error: string | null;
  created_at: string;
}

const TEMPLATES: Array<{
  name: string;
  description: string;
  trigger_type: string;
  actions: { type: string; params: Record<string, unknown> }[];
}> = [
  {
    name: "Tarefa concluída → próxima etapa",
    description: "Quando uma tarefa é concluída, criar uma nova tarefa de continuação.",
    trigger_type: "task_completed",
    actions: [{ type: "create_task", params: { title: "Próxima etapa: {{tarefa.titulo}}", due_in_days: 3, priority: "medium" } }],
  },
  {
    name: "Venda fechada → registrar pagamento",
    description: "Quando uma tarefa é concluída, inserir registro pendente em Pagamentos.",
    trigger_type: "task_completed",
    actions: [{ type: "create_payment", params: { description: "Pagamento ref. {{tarefa.titulo}}", amount: 0, due_in_days: 7 } }],
  },
  {
    name: "Prazo vencido → notificar gestor",
    description: "Quando uma tarefa vence, notificar o gestor.",
    trigger_type: "due_passed",
    actions: [{ type: "notify_user", params: { title: "Tarefa em atraso: {{tarefa.titulo}}" } }],
  },
];

function AutomationsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<AutomationRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [editing, setEditing] = useState<AutomationRow | null>(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    const [a, r] = await Promise.all([
      supabase.from("automations").select("*").order("created_at", { ascending: false }),
      supabase.from("automation_runs").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    setItems((a.data ?? []) as AutomationRow[]);
    setRuns((r.data ?? []) as RunRow[]);
  };
  useEffect(() => { void load(); }, []);

  const toggle = async (a: AutomationRow) => {
    await supabase.from("automations").update({ enabled: !a.enabled }).eq("id", a.id);
    void load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir automação?")) return;
    await supabase.from("automations").delete().eq("id", id);
    void load();
  };

  const useTemplate = async (tpl: typeof TEMPLATES[number]) => {
    if (!user) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from("automations").insert([{
      name: tpl.name,
      description: tpl.description,
      trigger_type: tpl.trigger_type,
      conditions: [] as unknown,
      actions: tpl.actions as unknown,
      enabled: true,
      created_by: user.id,
    } as any]);
    if (error) { toast.error(error.message); return; }
    toast.success("Template aplicado!");
    void load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Automações</h1>
          <p className="text-sm text-muted-foreground">Crie fluxos: gatilho → condições → ações.</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nova automação
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="text-sm font-semibold mb-2 flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Templates prontos</div>
          <div className="grid sm:grid-cols-3 gap-2">
            {TEMPLATES.map((t) => (
              <button key={t.name} onClick={() => useTemplate(t)} className="text-left rounded-md border p-3 hover:border-primary/50 transition">
                <div className="text-sm font-medium">{t.name}</div>
                <div className="text-xs text-muted-foreground mt-1">{t.description}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {items.map((a) => (
          <Card key={a.id}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-md bg-primary/10 text-primary grid place-items-center"><Workflow className="h-4 w-4" /></div>
              <button className="flex-1 text-left" onClick={() => { setEditing(a); setOpen(true); }}>
                <div className="font-medium">{a.name}</div>
                <div className="text-xs text-muted-foreground">
                  Quando {TRIGGER_LABEL[a.trigger_type] ?? a.trigger_type} →{" "}
                  {(a.actions as { type: string }[] | null)?.map((x) => ACTION_LABEL[x.type] ?? x.type).join(", ") ?? "—"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {a.run_count ?? 0} execuções · último: {a.last_run_at ? formatDateTime(a.last_run_at) : "nunca"}
                </div>
              </button>
              <Switch checked={a.enabled} onCheckedChange={() => toggle(a)} />
              <Button variant="ghost" size="icon" onClick={() => remove(a.id)}><Trash2 className="h-4 w-4" /></Button>
            </CardContent>
          </Card>
        ))}
        {items.length === 0 && (
          <Card><CardContent className="p-6 text-center text-muted-foreground">Nenhuma automação ainda.</CardContent></Card>
        )}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="text-sm font-semibold mb-3 flex items-center gap-2"><History className="h-4 w-4" /> Histórico de execuções</div>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma execução ainda.</p>
          ) : (
            <ul className="divide-y text-sm">
              {runs.map((r) => {
                const a = items.find((x) => x.id === r.automation_id);
                return (
                  <li key={r.id} className="py-2 flex items-center justify-between">
                    <div>
                      <div className="font-medium">{a?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{formatDateTime(r.created_at)} · {r.error ?? "—"}</div>
                    </div>
                    <Badge className={r.status === "success" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}>
                      {r.status}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <AutomationEditorDialog
        open={open}
        onOpenChange={setOpen}
        automation={editing}
        onSaved={() => void load()}
      />
    </div>
  );
}
