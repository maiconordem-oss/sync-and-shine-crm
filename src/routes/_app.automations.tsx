import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Workflow, Trash2, History, Sparkles, AlertTriangle,
  CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp, Copy,
  Zap, Info,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { TRIGGER_LABEL, ACTION_LABEL } from "@/lib/labels";
import { AutomationEditorDialog } from "@/components/automations/automation-editor";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

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

// ── Templates prontos ──────────────────────────────────────────────────────────
const TEMPLATES: Array<{
  name: string;
  description: string;
  trigger_type: string;
  icon: string;
  category: string;
  actions: { type: string; params: Record<string, unknown> }[];
}> = [
  {
    name: "Tarefa PJ concluída → registrar pagamento",
    description: "Quando uma tarefa externa é concluída, cria automaticamente o pagamento pendente com o valor da tarefa para o responsável.",
    trigger_type: "task_completed",
    icon: "💰",
    category: "Financeiro",
    actions: [{
      type: "create_payment",
      params: {
        description: "Pagamento ref. tarefa: {{tarefa.titulo}}",
        use_task_value: true,   // pega service_value automaticamente
        due_in_days: 5,
        // beneficiary_user_id vazio = usa assignee_id da tarefa
      }
    }],
  },
  {
    name: "Tarefa concluída → criar próxima etapa",
    description: "Ao concluir uma tarefa, cria automaticamente uma nova tarefa de continuação com prazo em 3 dias.",
    trigger_type: "task_completed",
    icon: "🔄",
    category: "Produtividade",
    actions: [{ type: "create_task", params: { title: "Próxima etapa: {{tarefa.titulo}}", due_in_days: 3, priority: "medium" } }],
  },
  {
    name: "Prazo vencido → notificar gestor",
    description: "Quando uma tarefa passa do prazo sem ser concluída, o gestor recebe uma notificação.",
    trigger_type: "due_passed",
    icon: "⚠️",
    category: "Alertas",
    actions: [{ type: "notify_user", params: { title: "⚠️ Tarefa em atraso: {{tarefa.titulo}}", body: "A tarefa passou do prazo sem ser concluída." } }],
  },
  {
    name: "Tarefa concluída → comentar registro",
    description: "Adiciona automaticamente um comentário de conclusão no histórico da tarefa.",
    trigger_type: "task_completed",
    icon: "💬",
    category: "Comunicação",
    actions: [{ type: "add_comment", params: { content: "✅ Tarefa concluída por {{usuario.nome}} em {{data.hoje}}." } }],
  },
  {
    name: "Responsável mudou → notificar",
    description: "Notifica o novo responsável quando a tarefa é atribuída a ele.",
    trigger_type: "assignee_changed",
    icon: "👤",
    category: "Comunicação",
    actions: [{ type: "notify_user", params: { title: "📋 Tarefa atribuída: {{tarefa.titulo}}", body: "Você foi designado como responsável por esta tarefa." } }],
  },
  {
    name: "Tarefa em revisão → notificar criador",
    description: "Quando o responsável manda para revisão, notifica o criador da tarefa.",
    trigger_type: "status_changed",
    icon: "🔍",
    category: "Aprovação",
    actions: [{ type: "add_comment", params: { content: "📬 {{usuario.nome}} enviou a tarefa para revisão." } }],
  },
];

const CATEGORY_COLORS: Record<string, string> = {
  Financeiro: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Produtividade: "bg-blue-50 text-blue-700 border-blue-200",
  Alertas: "bg-amber-50 text-amber-700 border-amber-200",
  Comunicação: "bg-purple-50 text-purple-700 border-purple-200",
  Aprovação: "bg-orange-50 text-orange-700 border-orange-200",
};

// ── Page ───────────────────────────────────────────────────────────────────────

function AutomationsPage() {
  const { user, isManagerOrAdmin } = useAuth();
  const [items, setItems] = useState<AutomationRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [editing, setEditing] = useState<AutomationRow | null>(null);
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);

  const load = async () => {
    const [a, r] = await Promise.all([
      supabase.from("automations").select("*").order("created_at", { ascending: false }),
      supabase.from("automation_runs").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    setItems((a.data ?? []) as AutomationRow[]);
    setRuns((r.data ?? []) as RunRow[]);
  };

  useEffect(() => { void load(); }, []);

  // Detect duplicates: same name OR same trigger+action combo
  const duplicates = items.filter((a) =>
    items.some((b) => b.id !== a.id && b.name === a.name)
  ).map((a) => a.id);

  const toggle = async (a: AutomationRow) => {
    await supabase.from("automations").update({ enabled: !a.enabled }).eq("id", a.id);
    void load();
    toast.success(a.enabled ? "Automação desativada." : "Automação ativada!");
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir esta automação?")) return;
    await supabase.from("automations").delete().eq("id", id);
    void load();
    toast.success("Automação excluída.");
  };

  const removeDuplicates = async () => {
    // Keep the enabled one or the most recent; delete the rest with same name
    const seen = new Map<string, string>(); // name → id to keep
    const toDelete: string[] = [];
    for (const a of [...items].reverse()) { // oldest first
      const key = a.name;
      if (seen.has(key)) {
        // Keep enabled or most recent
        const keepId = seen.get(key)!;
        const keepItem = items.find((x) => x.id === keepId);
        if (!keepItem?.enabled && a.enabled) {
          toDelete.push(keepId);
          seen.set(key, a.id);
        } else {
          toDelete.push(a.id);
        }
      } else {
        seen.set(key, a.id);
      }
    }
    if (toDelete.length === 0) { toast.info("Nenhuma duplicata encontrada."); return; }
    for (const id of toDelete) {
      await supabase.from("automations").delete().eq("id", id);
    }
    toast.success(`${toDelete.length} automação(ões) duplicada(s) removida(s).`);
    void load();
  };

  const useTemplate = async (tpl: typeof TEMPLATES[number]) => {
    if (!user) return;
    // Check if already exists
    const exists = items.some((a) => a.name === tpl.name);
    if (exists) {
      toast.error(`Automação "${tpl.name}" já existe. Remova ou renomeie antes de usar o template novamente.`);
      return;
    }
    const { error } = await supabase.from("automations").insert([{
      name: tpl.name,
      description: tpl.description,
      trigger_type: tpl.trigger_type,
      conditions: [] as unknown,
      actions: tpl.actions as unknown,
      enabled: false, // start disabled so user reviews first
      created_by: user.id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any]);
    if (error) { toast.error(error.message); return; }
    toast.success(`Template "${tpl.name}" criado! Revise e ative quando estiver pronto.`);
    void load();
  };

  const runsForAutomation = (id: string) => runs.filter((r) => r.automation_id === id);
  const enabledCount = items.filter((a) => a.enabled).length;
  const errorCount = runs.filter((r) => r.status === "error").length;

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" /> Automações
          </h1>
          <p className="text-sm text-muted-foreground">
            {items.length} automação{items.length !== 1 ? "ões" : ""} ·
            {" "}{enabledCount} ativa{enabledCount !== 1 ? "s" : ""} ·
            {" "}{runs.length} execuções
            {errorCount > 0 && <span className="text-rose-600"> · {errorCount} erros</span>}
          </p>
        </div>
        <div className="flex gap-2">
          {duplicates.length > 0 && (
            <Button variant="outline" size="sm" onClick={removeDuplicates} className="border-amber-300 text-amber-700 hover:bg-amber-50">
              <AlertTriangle className="h-4 w-4 mr-1" />
              Remover {duplicates.length} duplicata{duplicates.length !== 1 ? "s" : ""}
            </Button>
          )}
          {isManagerOrAdmin && (
            <Button onClick={() => { setEditing(null); setOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Nova automação
            </Button>
          )}
        </div>
      </div>

      {/* Duplicates warning */}
      {duplicates.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-medium text-amber-800">Automações duplicadas detectadas</div>
            <div className="text-xs text-amber-700 mt-0.5">
              Existem {duplicates.length} automações com o mesmo nome. Isso causa execuções duplicadas (ex: múltiplos pagamentos para a mesma tarefa). 
              Clique em "Remover duplicatas" para manter apenas uma de cada.
            </div>
          </div>
        </div>
      )}

      {/* How it works */}
      <div className="rounded-lg border bg-muted/20 p-3">
        <div className="flex items-center gap-2 text-sm font-medium mb-2">
          <Info className="h-4 w-4 text-primary" /> Como funciona
        </div>
        <div className="text-xs text-muted-foreground space-y-1">
          <p>Cada automação tem 3 partes: <strong>Quando</strong> (gatilho) → <strong>Se</strong> (condições opcionais) → <strong>Então</strong> (ações).</p>
          <p>Templates criados ficam <strong>desativados</strong> por padrão — revise os campos e ative quando estiver pronto.</p>
          <p>A ação <strong>"Registrar pagamento"</strong> usa automaticamente o valor da tarefa e o responsável — não precisa digitar.</p>
        </div>
      </div>

      {/* Templates */}
      <div>
        <div className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> Templates prontos
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {TEMPLATES.map((t) => {
            const alreadyExists = items.some((a) => a.name === t.name);
            return (
              <button
                key={t.name}
                onClick={() => useTemplate(t)}
                disabled={alreadyExists}
                className={cn(
                  "text-left rounded-xl border p-3 transition-all",
                  alreadyExists
                    ? "opacity-50 cursor-not-allowed bg-muted/30"
                    : "hover:border-primary/50 hover:shadow-sm bg-background"
                )}
              >
                <div className="flex items-start gap-2 mb-1">
                  <span className="text-lg">{t.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium leading-snug">{t.name}</div>
                    {alreadyExists && <span className="text-[10px] text-muted-foreground">Já adicionado</span>}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground leading-relaxed">{t.description}</div>
                <Badge variant="outline" className={cn("text-[10px] mt-2 h-4 px-1.5", CATEGORY_COLORS[t.category])}>
                  {t.category}
                </Badge>
              </button>
            );
          })}
        </div>
      </div>

      {/* Automations list */}
      <div>
        <div className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Workflow className="h-4 w-4" /> Minhas automações ({items.length})
        </div>
        <div className="space-y-2">
          {items.length === 0 && (
            <div className="rounded-xl border bg-muted/10 p-8 text-center text-muted-foreground text-sm">
              <Workflow className="h-8 w-8 mx-auto mb-2 opacity-20" />
              Nenhuma automação ainda. Use um template ou crie uma nova.
            </div>
          )}
          {items.map((a) => {
            const isDuplicate = duplicates.includes(a.id);
            const autoRuns = runsForAutomation(a.id);
            const lastError = autoRuns.find((r) => r.status === "error");
            const isExpanded = expandedHistory === a.id;

            return (
              <div
                key={a.id}
                className={cn(
                  "rounded-xl border bg-background transition-all",
                  isDuplicate && "border-amber-300 bg-amber-50/30",
                  !a.enabled && "opacity-70",
                )}
              >
                <div className="flex items-center gap-3 p-4">
                  {/* Icon */}
                  <div className={cn(
                    "h-10 w-10 rounded-lg grid place-items-center shrink-0 text-lg",
                    a.enabled ? "bg-primary/10" : "bg-muted",
                  )}>
                    {TEMPLATES.find((t) => t.name === a.name)?.icon ?? <Workflow className="h-4 w-4 text-muted-foreground" />}
                  </div>

                  {/* Info */}
                  <button
                    className="flex-1 text-left min-w-0"
                    onClick={() => { setEditing(a); setOpen(true); }}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{a.name}</span>
                      {isDuplicate && (
                        <Badge className="text-[10px] h-4 px-1.5 bg-amber-100 text-amber-800">
                          <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> Duplicada
                        </Badge>
                      )}
                      {!a.enabled && <Badge variant="outline" className="text-[10px] h-4 px-1.5">Inativa</Badge>}
                      {lastError && <Badge className="text-[10px] h-4 px-1.5 bg-rose-100 text-rose-700">Erro recente</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      <span className="font-medium">{TRIGGER_LABEL[a.trigger_type] ?? a.trigger_type}</span>
                      {" → "}
                      {(a.actions as { type: string }[] | null)?.map((x) => ACTION_LABEL[x.type] ?? x.type).join(" + ") ?? "—"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {a.run_count ?? 0} execuções · último: {a.last_run_at ? formatDateTime(a.last_run_at) : "nunca"}
                    </div>
                  </button>

                  {/* Controls */}
                  <div className="flex items-center gap-2 shrink-0">
                    {autoRuns.length > 0 && (
                      <button
                        onClick={() => setExpandedHistory(isExpanded ? null : a.id)}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                        title="Ver histórico"
                      >
                        <History className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        if (!user) return;
                        const { error } = await supabase.from("automations").insert([{
                          name: a.name + " (cópia)",
                          description: a.description,
                          trigger_type: a.trigger_type,
                          conditions: a.conditions,
                          actions: a.actions,
                          enabled: false,
                          created_by: user.id,
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        } as any]);
                        if (error) { toast.error(error.message); return; }
                        toast.success("Cópia criada!");
                        void load();
                      }}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                      title="Duplicar"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <Switch checked={a.enabled} onCheckedChange={() => toggle(a)} />
                    <button
                      onClick={() => remove(a.id)}
                      className="p-1.5 rounded hover:bg-rose-50 text-muted-foreground hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* History panel */}
                {isExpanded && (
                  <div className="border-t bg-muted/10 px-4 py-3">
                    <div className="text-xs font-medium text-muted-foreground mb-2">
                      Últimas {Math.min(autoRuns.length, 10)} execuções
                    </div>
                    <div className="space-y-1">
                      {autoRuns.slice(0, 10).map((r) => (
                        <div key={r.id} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                          <div className="flex items-center gap-2">
                            {r.status === "success"
                              ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              : <XCircle className="h-3.5 w-3.5 text-rose-600" />
                            }
                            <span className="text-muted-foreground">{formatDateTime(r.created_at)}</span>
                          </div>
                          {r.error && <span className="text-rose-600 truncate max-w-[200px]">{r.error}</span>}
                          <Badge className={cn("text-[10px] px-1.5 h-4",
                            r.status === "success" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                          )}>
                            {r.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Global history toggle */}
      <div>
        <button
          onClick={() => setShowHistory((h) => !h)}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <History className="h-4 w-4" />
          Histórico completo ({runs.length} execuções)
          {showHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {showHistory && (
          <Card className="mt-2">
            <CardContent className="p-0">
              {runs.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma execução ainda.</div>
              ) : (
                <div className="divide-y max-h-80 overflow-y-auto">
                  {runs.map((r) => {
                    const a = items.find((x) => x.id === r.automation_id);
                    return (
                      <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                        {r.status === "success"
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                          : <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
                        }
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{a?.name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatDateTime(r.created_at)}
                            {r.error && <span className="text-rose-600 ml-2">{r.error}</span>}
                          </div>
                        </div>
                        <Badge className={cn("text-[10px] shrink-0",
                          r.status === "success" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                        )}>
                          {r.status}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <AutomationEditorDialog
        open={open}
        onOpenChange={setOpen}
        automation={editing}
        onSaved={() => void load()}
      />
    </div>
  );
}
