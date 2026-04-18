import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatBRL } from "@/lib/format";
import { BarChart3, Users, CheckCircle2, Wallet, TrendingUp } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_app/reports")({
  component: ReportsPage,
});

interface PJProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  contract_type: "clt" | "pj";
}

interface PaymentRow {
  id: string;
  amount: number;
  status: "pending" | "paid" | "cancelled";
  beneficiary_user_id: string | null;
  due_date: string | null;
  paid_date: string | null;
  created_at: string;
  task_id: string | null;
}

interface TaskRow {
  id: string;
  title: string;
  assignee_id: string | null;
  service_value: number | null;
  task_type: "internal" | "external";
  status: string;
  completed_at: string | null;
}

function monthBounds(yyyymm: string) {
  const [y, m] = yyyymm.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { startISO: start.toISOString(), endISO: end.toISOString(), startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

function ReportsPage() {
  const { isManagerOrAdmin } = useAuth();
  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(defaultMonth);
  const [pjs, setPjs] = useState<PJProfile[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { startISO, endISO, startDate, endDate } = monthBounds(month);
      const [pjRes, payRes, taskRes] = await Promise.all([
        supabase.from("profiles").select("id,full_name,email,contract_type").eq("contract_type", "pj"),
        supabase.from("payments").select("id,amount,status,beneficiary_user_id,due_date,paid_date,created_at,task_id").or(`and(due_date.gte.${startDate},due_date.lt.${endDate}),and(due_date.is.null,created_at.gte.${startISO},created_at.lt.${endISO})`),
        supabase.from("tasks").select("id,title,assignee_id,service_value,task_type,status,completed_at").eq("task_type", "external").eq("status", "done").gte("completed_at", startISO).lt("completed_at", endISO),
      ]);
      if (cancelled) return;
      setPjs((pjRes.data ?? []) as PJProfile[]);
      setPayments((payRes.data ?? []) as PaymentRow[]);
      setTasks((taskRes.data ?? []) as TaskRow[]);
      setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, [month]);

  const rows = useMemo(() => {
    return pjs.map((pj) => {
      const pjPayments = payments.filter((p) => p.beneficiary_user_id === pj.id);
      const pjTasks = tasks.filter((t) => t.assignee_id === pj.id);
      const totalPending = pjPayments.filter((p) => p.status === "pending").reduce((s, p) => s + Number(p.amount), 0);
      const totalPaid = pjPayments.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.amount), 0);
      const totalToPay = totalPending + totalPaid;
      const completedTasks = pjTasks.length;
      const tasksWithValue = pjTasks.filter((t) => t.service_value && Number(t.service_value) > 0);
      const sumValues = tasksWithValue.reduce((s, t) => s + Number(t.service_value ?? 0), 0);
      const avgPerTask = tasksWithValue.length > 0 ? sumValues / tasksWithValue.length : 0;
      return { pj, totalPending, totalPaid, totalToPay, completedTasks, avgPerTask };
    }).sort((a, b) => b.totalToPay - a.totalToPay);
  }, [pjs, payments, tasks]);

  const grandTotals = useMemo(() => {
    return rows.reduce((acc, r) => ({
      pending: acc.pending + r.totalPending,
      paid: acc.paid + r.totalPaid,
      tasks: acc.tasks + r.completedTasks,
    }), { pending: 0, paid: 0, tasks: 0 });
  }, [rows]);

  if (!isManagerOrAdmin) {
    return <div className="text-sm text-muted-foreground">Acesso restrito a gestores.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><BarChart3 className="h-6 w-6" /> Relatório de PJs</h1>
          <p className="text-sm text-muted-foreground">Total a pagar, tarefas concluídas e valor médio por anúncio.</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Mês de referência</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-[180px]" />
          </div>
          <Button variant="outline" onClick={() => setMonth(defaultMonth)}>Mês atual</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <SummaryCard icon={Users} label="PJs ativos" value={String(pjs.length)} />
        <SummaryCard icon={Wallet} label="A pagar (pendente)" value={formatBRL(grandTotals.pending)} accent="text-amber-700" />
        <SummaryCard icon={CheckCircle2} label="Pago no mês" value={formatBRL(grandTotals.paid)} accent="text-emerald-700" />
        <SummaryCard icon={TrendingUp} label="Tarefas externas concluídas" value={String(grandTotals.tasks)} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Por prestador</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-3 font-medium">Prestador</th>
                <th className="p-3 font-medium text-right">Tarefas concluídas</th>
                <th className="p-3 font-medium text-right">Valor médio / anúncio</th>
                <th className="p-3 font-medium text-right">Pendente</th>
                <th className="p-3 font-medium text-right">Pago</th>
                <th className="p-3 font-medium text-right">Total do mês</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Carregando...</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nenhum PJ cadastrado.</td></tr>
              )}
              {!loading && rows.map((r) => (
                <tr key={r.pj.id} className="border-t hover:bg-muted/30">
                  <td className="p-3">
                    <div className="font-medium">{r.pj.full_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.pj.email ?? ""}</div>
                  </td>
                  <td className="p-3 text-right">
                    <Badge variant="secondary">{r.completedTasks}</Badge>
                  </td>
                  <td className="p-3 text-right">{r.avgPerTask > 0 ? formatBRL(r.avgPerTask) : "—"}</td>
                  <td className="p-3 text-right text-amber-700">{formatBRL(r.totalPending)}</td>
                  <td className="p-3 text-right text-emerald-700">{formatBRL(r.totalPaid)}</td>
                  <td className="p-3 text-right font-semibold">{formatBRL(r.totalToPay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        * "Tarefas concluídas" considera apenas tarefas externas marcadas como concluídas dentro do mês selecionado.{" "}
        <Link to="/payments" className="underline">Ver pagamentos</Link>
      </p>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, accent }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 grid place-items-center text-primary"><Icon className="h-5 w-5" /></div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className={`text-xl font-bold truncate ${accent ?? ""}`}>{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
