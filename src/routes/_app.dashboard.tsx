import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, ListChecks, AlertTriangle, Workflow } from "lucide-react";
import { formatBRL, formatDate } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { Link } from "@tanstack/react-router";
import { useTaskThumbnail } from "@/components/tasks/task-attachments";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

interface Stats {
  myTasks: number;
  overdue: number;
  doneWeek: number;
  pendingPayments: number;
  pendingTotal: number;
  recentRuns: number;
}

interface UpcomingTask {
  id: string;
  title: string;
  due_date: string | null;
  status: string;
}

function DashboardPage() {
  const { user, profile, isManagerOrAdmin } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingTask[]>([]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const today = new Date().toISOString();
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      // Mesma base do Relatório PJ: tarefas externas do mês + pagamentos avulsos,
      // descontando fechamentos já pagos.
      const startDate = `${currentMonth}-01`;
      const startISO = new Date(`${startDate}T00:00:00`).toISOString();
      const endISO = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
      const endDate = endISO.slice(0, 10);

      let manualQuery = supabase
        .from("payments")
        .select("id,amount,due_date,created_at,beneficiary_user_id,task_id,status")
        .eq("status", "pending")
        .is("task_id", null)
        .gt("amount", 0);
      if (!isManagerOrAdmin) manualQuery = manualQuery.eq("beneficiary_user_id", user.id);

      const [my, over, week, reportTasks, manualRes, closures, runs, up] = await Promise.all([
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("assignee_id", user.id).neq("status", "done"),
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("assignee_id", user.id).lt("due_date", today).neq("status", "done"),
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("assignee_id", user.id).eq("status", "done").gte("updated_at", weekAgo),
        supabase.rpc("get_pj_tasks_for_report", { start_iso: startISO, end_iso: endISO }),
        manualQuery,
        supabase.from("monthly_closures").select("pj_user_id,status,total_amount").eq("reference_month", currentMonth),
        supabase.from("automation_runs").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
        supabase.from("tasks").select("id,title,due_date,status").eq("assignee_id", user.id).neq("status", "done").not("due_date", "is", null).order("due_date", { ascending: true }).limit(6),
      ]);

      const perPj = new Map<string, { toPay: number; count: number }>();
      ((reportTasks.data ?? []) as {
        assignee_id: string | null;
        service_value: number | null;
        status: string;
      }[]).forEach((t) => {
        if (!t.assignee_id) return;
        if (t.status === "canceled") return;
        const value = Number(t.service_value ?? 0);
        if (value <= 0) return;
        if (!isManagerOrAdmin && t.assignee_id !== user.id) return;
        const cur = perPj.get(t.assignee_id) ?? { toPay: 0, count: 0 };
        cur.toPay += value;
        cur.count += 1;
        perPj.set(t.assignee_id, cur);
      });

      ((manualRes.data ?? []) as {
        amount: number;
        due_date: string | null;
        created_at: string;
        beneficiary_user_id: string | null;
      }[]).forEach((p) => {
        if (!p.beneficiary_user_id) return;
        const inMonth = p.due_date
          ? p.due_date >= startDate && p.due_date < endDate
          : p.created_at >= startISO && p.created_at < endISO;
        if (!inMonth) return;
        const cur = perPj.get(p.beneficiary_user_id) ?? { toPay: 0, count: 0 };
        cur.toPay += Number(p.amount);
        cur.count += 1;
        perPj.set(p.beneficiary_user_id, cur);
      });

      const closureMap = new Map(
        ((closures.data ?? []) as { pj_user_id: string; status: string; total_amount: number | null }[])
          .map((c) => [c.pj_user_id, c]),
      );

      let totalPending = 0;
      let pendingCount = 0;
      perPj.forEach((v, pjId) => {
        const closure = closureMap.get(pjId);
        const paid = closure && closure.status === "paid" ? Number(closure.total_amount ?? 0) : 0;
        const pending = Math.max(0, v.toPay - paid);
        totalPending += pending;
        if (pending > 0) pendingCount += v.count;
      });

      setStats({
        myTasks: my.count ?? 0,
        overdue: over.count ?? 0,
        doneWeek: week.count ?? 0,
        pendingPayments: pendingCount,
        pendingTotal: totalPending,
        recentRuns: runs.count ?? 0,
      });
      setUpcoming((up.data ?? []) as UpcomingTask[]);
    })();
  }, [user, isManagerOrAdmin]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Olá, {profile?.full_name?.split(" ")[0] ?? "bem-vindo"}!</h1>
        <p className="text-muted-foreground text-sm">Visão geral das suas tarefas e atividades.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={ListChecks} label="Minhas tarefas" value={stats?.myTasks ?? 0} />
        <StatCard icon={AlertTriangle} label="Em atraso" value={stats?.overdue ?? 0} accent="text-rose-600" />
        <StatCard icon={ListChecks} label="Concluídas (7d)" value={stats?.doneWeek ?? 0} accent="text-emerald-600" />
        <Link to="/reports" className="block">
          <StatCard
            icon={Wallet}
            label="Pagamentos pendentes (mês atual)"
            value={`${stats?.pendingPayments ?? 0}`}
            sub={formatBRL(stats?.pendingTotal ?? 0)}
          />
        </Link>
      </div>

      {isManagerOrAdmin && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Workflow className="h-4 w-4" /> Automações executadas (7 dias)
            </CardTitle>
            <Link to="/automations" className="text-sm text-primary hover:underline">
              Ver tudo
            </Link>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.recentRuns ?? 0}</div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Próximos prazos</CardTitle>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma tarefa com prazo no momento.</p>
          ) : (
            <ul className="space-y-2">
              {upcoming.map((t) => (
                <DashTaskRow key={t.id} task={t} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DashTaskRow({ task }: { task: UpcomingTask }) {
  const thumb = useTaskThumbnail(task.id);
  return (
    <li className="flex items-center gap-3 rounded-lg border bg-card hover:border-primary/30 transition-colors p-2 group">
      {thumb ? (
        <div className="h-12 w-16 rounded-md overflow-hidden shrink-0 bg-muted">
          <img src={thumb} alt={task.title} className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className="h-12 w-16 rounded-md shrink-0 bg-muted/50 flex items-center justify-center text-muted-foreground/30 text-xs">
          sem img
        </div>
      )}
      <div className="flex-1 min-w-0">
        <Link to="/tasks/$taskId" params={{ taskId: task.id }} className="text-sm font-medium hover:underline truncate block">
          {task.title}
        </Link>
        <span className="text-xs text-muted-foreground">{formatDate(task.due_date)}</span>
      </div>
    </li>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 grid place-items-center text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className={`text-2xl font-bold ${accent ?? ""}`}>{value}</div>
            {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
