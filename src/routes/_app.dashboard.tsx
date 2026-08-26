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

      let payQuery = supabase
        .from("payments")
        .select("id,amount,due_date,beneficiary_user_id,task_id")
        .eq("status", "pending")
        .gt("amount", 0);
      if (!isManagerOrAdmin) payQuery = payQuery.eq("beneficiary_user_id", user.id);

      const [my, over, week, payRows, closures, runs, up] = await Promise.all([
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("assignee_id", user.id).neq("status", "done"),
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("assignee_id", user.id).lt("due_date", today).neq("status", "done"),
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("assignee_id", user.id).eq("status", "done").gte("updated_at", weekAgo),
        payQuery,
        supabase.from("monthly_closures").select("pj_user_id,status").eq("reference_month", currentMonth),
        supabase.from("automation_runs").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
        supabase.from("tasks").select("id,title,due_date,status").eq("assignee_id", user.id).neq("status", "done").not("due_date", "is", null).order("due_date", { ascending: true }).limit(6),
      ]);

      const rows = (payRows.data ?? []) as {
        id: string;
        amount: number;
        due_date: string | null;
        beneficiary_user_id: string | null;
        task_id: string | null;
      }[];

      // Resolve o mês pelo mesmo critério do relatório PJ (data de referência da tarefa)
      const taskIds = rows.map((r) => r.task_id).filter((v): v is string => !!v);
      const taskMonth = new Map<string, string>();
      if (taskIds.length > 0) {
        const { data: taskRows } = await supabase
          .from("tasks")
          .select("id,completed_at,approved_at,canceled_at,created_at")
          .in("id", taskIds);
        ((taskRows ?? []) as {
          id: string;
          completed_at: string | null;
          approved_at: string | null;
          canceled_at: string | null;
          created_at: string;
        }[]).forEach((t) => {
          const ref = t.completed_at ?? t.approved_at ?? t.canceled_at ?? t.created_at;
          taskMonth.set(t.id, ref.slice(0, 7));
        });
      }

      const closedPjs = new Set(
        ((closures.data ?? []) as { pj_user_id: string; status: string }[])
          .filter((c) => c.status === "closed" || c.status === "paid")
          .map((c) => c.pj_user_id),
      );

      const monthRows = rows.filter((r) => {
        const month = (r.task_id && taskMonth.get(r.task_id)) || (r.due_date ? r.due_date.slice(0, 7) : null);
        if (month !== currentMonth) return false;
        if (r.beneficiary_user_id && closedPjs.has(r.beneficiary_user_id)) return false;
        return true;
      });

      const totalPending = monthRows.reduce((s, r) => s + Number(r.amount), 0);

      setStats({
        myTasks: my.count ?? 0,
        overdue: over.count ?? 0,
        doneWeek: week.count ?? 0,
        pendingPayments: monthRows.length,
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
        <StatCard
          icon={Wallet}
          label="Pagamentos pendentes"
          value={`${stats?.pendingPayments ?? 0}`}
          sub={formatBRL(stats?.pendingTotal ?? 0)}
        />
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
