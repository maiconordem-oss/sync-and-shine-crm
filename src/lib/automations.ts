// Client-side automation engine.
// Executes registered automations in response to in-app events.
// Runs as the currently authenticated user (RLS applies).
import { supabase } from "@/integrations/supabase/client";
import { addDays, format } from "date-fns";

export type TriggerType =
  | "task_created"
  | "task_completed"
  | "status_changed"
  | "assignee_changed"
  | "due_passed"
  | "comment_added"
  | "task_moved_project";

export interface AutomationCondition {
  field: "project_id" | "priority" | "tag" | "assignee_id";
  op: "eq" | "contains";
  value: string;
}

export interface AutomationAction {
  type:
    | "create_task"
    | "assign_user"
    | "change_status"
    | "add_comment"
    | "notify_user"
    | "create_payment"
    | "webhook"
    | "add_tag";
  params: Record<string, unknown>;
}

export interface Automation {
  id: string;
  name: string;
  trigger_type: TriggerType;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  enabled: boolean;
  run_count: number;
  last_run_at: string | null;
}

export interface TriggerContext {
  trigger: TriggerType;
  task?: Record<string, unknown> | null;
  previousStatus?: string;
  previousAssignee?: string | null;
  comment?: { content: string; author_id: string };
  userId: string;
  userName?: string;
}

function renderTemplate(tpl: string, ctx: TriggerContext): string {
  const t = ctx.task ?? {};
  const today = new Date();
  return tpl
    .replace(/\{\{tarefa\.titulo\}\}/g, String((t as { title?: string }).title ?? ""))
    .replace(/\{\{tarefa\.responsavel\}\}/g, String((t as { assignee_id?: string }).assignee_id ?? ""))
    .replace(/\{\{tarefa\.projeto\}\}/g, String((t as { project_id?: string }).project_id ?? ""))
    .replace(/\{\{tarefa\.prazo\}\}/g, String((t as { due_date?: string }).due_date ?? ""))
    .replace(/\{\{usuario\.nome\}\}/g, ctx.userName ?? "")
    .replace(/\{\{data\.hoje\}\}/g, format(today, "yyyy-MM-dd"))
    .replace(/\{\{data\.hoje\+(\d+)d\}\}/g, (_, d) => format(addDays(today, Number(d)), "yyyy-MM-dd"));
}

function matchesConditions(conds: AutomationCondition[], ctx: TriggerContext): boolean {
  if (!conds || conds.length === 0) return true;
  const t = (ctx.task ?? {}) as Record<string, unknown>;
  return conds.every((c) => {
    const v = t[c.field];
    if (c.op === "eq") return String(v ?? "") === String(c.value);
    if (c.op === "contains") {
      if (Array.isArray(v)) return v.map(String).includes(String(c.value));
      return String(v ?? "").includes(String(c.value));
    }
    return false;
  });
}

async function executeAction(
  action: AutomationAction,
  ctx: TriggerContext,
): Promise<unknown> {
  const p = action.params as Record<string, unknown>;
  switch (action.type) {
    case "create_task": {
      const dueDays = Number(p.due_in_days ?? 0);
      const newTask = {
        title: renderTemplate(String(p.title ?? "Nova tarefa"), ctx),
        description: p.description ? renderTemplate(String(p.description), ctx) : null,
        project_id: (p.project_id as string) || (ctx.task as { project_id?: string } | null)?.project_id || null,
        assignee_id: (p.assignee_id as string) || null,
        priority: ((p.priority as string) || "medium") as "low" | "medium" | "high" | "urgent",
        status: "new" as const,
        due_date: dueDays ? addDays(new Date(), dueDays).toISOString() : null,
        created_by: ctx.userId,
      };
      const { data, error } = await supabase.from("tasks").insert([newTask]).select().single();
      if (error) throw error;
      return data;
    }
    case "assign_user": {
      if (!ctx.task) return null;
      const taskId = (ctx.task as { id?: string }).id;
      if (!taskId) return null;
      const { error } = await supabase
        .from("tasks")
        .update({ assignee_id: p.user_id as string })
        .eq("id", taskId);
      if (error) throw error;
      return { ok: true };
    }
    case "change_status": {
      const taskId = (ctx.task as { id?: string } | null)?.id;
      if (!taskId) return null;
      const { error } = await supabase
        .from("tasks")
        .update({ status: p.status as "new" | "in_progress" | "waiting" | "done" | "deferred" })
        .eq("id", taskId);
      if (error) throw error;
      return { ok: true };
    }
    case "add_comment": {
      const taskId = (ctx.task as { id?: string } | null)?.id;
      if (!taskId) return null;
      const { error } = await supabase.from("comments").insert({
        task_id: taskId,
        author_id: ctx.userId,
        content: renderTemplate(String(p.content ?? ""), ctx),
      });
      if (error) throw error;
      return { ok: true };
    }
    case "notify_user": {
      const { error } = await supabase.from("notifications").insert({
        user_id: p.user_id as string,
        type: "automation",
        title: renderTemplate(String(p.title ?? "Notificação"), ctx),
        body: p.body ? renderTemplate(String(p.body), ctx) : null,
        task_id: (ctx.task as { id?: string } | null)?.id ?? null,
      });
      if (error) throw error;
      return { ok: true };
    }
    case "create_payment": {
      const { data, error } = await supabase
        .from("payments")
        .insert({
          description: renderTemplate(String(p.description ?? "Pagamento"), ctx),
          amount: Number(p.amount ?? 0),
          currency: String(p.currency ?? "BRL"),
          beneficiary_user_id: (p.beneficiary_user_id as string) || null,
          beneficiary_name: (p.beneficiary_name as string) || null,
          status: "pending",
          due_date: p.due_in_days ? format(addDays(new Date(), Number(p.due_in_days)), "yyyy-MM-dd") : null,
          task_id: (ctx.task as { id?: string } | null)?.id ?? null,
          project_id: (ctx.task as { project_id?: string } | null)?.project_id ?? null,
          created_by: ctx.userId,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    case "webhook": {
      const url = String(p.url ?? "");
      if (!url) return null;
      try {
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trigger: ctx.trigger, task: ctx.task }),
        });
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    }
    case "add_tag": {
      const taskId = (ctx.task as { id?: string } | null)?.id;
      if (!taskId) return null;
      const tag = String(p.tag ?? "");
      const existing = ((ctx.task as { tags?: string[] } | null)?.tags ?? []) as string[];
      if (existing.includes(tag)) return { ok: true };
      const { error } = await supabase
        .from("tasks")
        .update({ tags: [...existing, tag] })
        .eq("id", taskId);
      if (error) throw error;
      return { ok: true };
    }
    default:
      return null;
  }
}

export async function runAutomations(ctx: TriggerContext, depth = 0): Promise<void> {
  if (depth > 5) return;
  const { data: rows } = await supabase
    .from("automations")
    .select("*")
    .eq("enabled", true)
    .eq("trigger_type", ctx.trigger);

  const list = (rows ?? []) as unknown as Automation[];
  for (const auto of list) {
    if (!matchesConditions(auto.conditions ?? [], ctx)) continue;
    const results: unknown[] = [];
    let runStatus = "success";
    let errorMsg: string | null = null;
    try {
      for (const action of auto.actions ?? []) {
        const r = await executeAction(action, ctx);
        results.push({ type: action.type, result: r });
      }
    } catch (e) {
      runStatus = "error";
      errorMsg = e instanceof Error ? e.message : String(e);
    }
    await supabase.from("automation_runs").insert([{
      automation_id: auto.id,
      status: runStatus,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      trigger_payload: ctx as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result: { actions: results } as any,
      error: errorMsg,
    }]);
    await supabase
      .from("automations")
      .update({ run_count: (auto.run_count ?? 0) + 1, last_run_at: new Date().toISOString() })
      .eq("id", auto.id);
  }
}
