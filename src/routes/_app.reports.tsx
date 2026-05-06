import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { formatBRL, formatDate, formatDateTime } from "@/lib/format";
import {
  BarChart3, Users, CheckCircle2, Wallet, TrendingUp,
  Lock, Unlock, FileDown, X, AlertTriangle, ChevronDown,
  ChevronUp, Receipt, CalendarCheck, Printer,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "@/lib/labels";

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
  beneficiary_name: string | null;
  description: string;
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

interface Closure {
  id: string;
  reference_month: string;
  pj_user_id: string;
  total_amount: number;
  tasks_count: number;
  status: "open" | "closed" | "paid";
  notes: string | null;
  closed_at: string | null;
  paid_at: string | null;
}

function monthBounds(yyyymm: string) {
  const [y, m] = yyyymm.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return {
    startISO: start.toISOString(),
    endISO: end.toISOString(),
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    label: start.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
  };
}

function exportCSV(rows: PJRow[], month: string) {
  const header = ["Prestador", "E-mail", "Tarefas", "Valor médio", "Pendente", "Pago", "Total", "Fechamento"];
  const body = rows.map((r) => [
    r.pj.full_name ?? "",
    r.pj.email ?? "",
    r.completedTasks,
    r.avgPerTask > 0 ? r.avgPerTask.toFixed(2) : "0",
    r.totalPending.toFixed(2),
    r.totalPaid.toFixed(2),
    r.totalToPay.toFixed(2),
    r.closure ? r.closure.status : "aberto",
  ]);
  const csv = [header, ...body].map((row) => row.map((c) => `"${c}"`).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `relatorio-pj-${month}.csv`; a.click();
  URL.revokeObjectURL(url);
}

interface PJRow {
  pj: PJProfile;
  totalPending: number;
  totalPaid: number;
  totalToPay: number;
  completedTasks: number;
  avgPerTask: number;
  payments: PaymentRow[];
  tasks: TaskRow[];
  closure: Closure | null;
}

// ─── PJ View (próprio dashboard financeiro) ───────────────────────────────────

function PJView({ userId }: { userId: string }) {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [closures, setClosures] = useState<Closure[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [p, c, t] = await Promise.all([
        supabase.from("payments").select("*").eq("beneficiary_user_id", userId).order("created_at", { ascending: false }),
        supabase.from("monthly_closures").select("*").eq("pj_user_id", userId).order("reference_month", { ascending: false }),
        supabase.from("tasks").select("id,title,service_value,task_type,status,completed_at").eq("assignee_id", userId).eq("task_type", "external").order("completed_at", { ascending: false }),
      ]);
      setPayments((p.data ?? []) as PaymentRow[]);
      setClosures((c.data ?? []) as Closure[]);
      setTasks((t.data ?? []) as TaskRow[]);
      setLoading(false);
    };
    void load();
  }, [userId]);

  const totalPending = payments.filter((p) => p.status === "pending").reduce((s, p) => s + Number(p.amount), 0);
  const totalPaid = payments.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.amount), 0);

  if (loading) return <div className="text-sm text-muted-foreground p-6">Carregando seus dados financeiros...</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Receipt className="h-6 w-6 text-primary" /> Meus pagamentos
        </h1>
        <p className="text-sm text-muted-foreground">Histórico de tarefas concluídas e pagamentos.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">A receber</div>
            <div className="text-2xl font-bold text-amber-700">{formatBRL(totalPending)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{payments.filter((p) => p.status === "pending").length} pagamentos pendentes</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Já recebido</div>
            <div className="text-2xl font-bold text-emerald-700">{formatBRL(totalPaid)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{payments.filter((p) => p.status === "paid").length} pagamentos</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Tarefas concluídas</div>
            <div className="text-2xl font-bold">{tasks.filter((t) => t.status === "done").length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">tarefas externas</div>
          </CardContent>
        </Card>
      </div>

      {/* Closures */}
      {closures.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><CalendarCheck className="h-4 w-4" /> Fechamentos mensais</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="p-3 text-left font-medium text-muted-foreground">Mês</th>
                  <th className="p-3 text-right font-medium text-muted-foreground">Tarefas</th>
                  <th className="p-3 text-right font-medium text-muted-foreground">Total</th>
                  <th className="p-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="p-3 text-left font-medium text-muted-foreground">Pago em</th>
                </tr>
              </thead>
              <tbody>
                {closures.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="p-3 font-medium">{monthBounds(c.reference_month).label}</td>
                    <td className="p-3 text-right">{c.tasks_count}</td>
                    <td className="p-3 text-right font-semibold">{formatBRL(c.total_amount)}</td>
                    <td className="p-3">
                      <ClosureBadge status={c.status} />
                    </td>
                    <td className="p-3 text-muted-foreground text-xs">{c.paid_at ? formatDateTime(c.paid_at) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Payments list */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4" /> Todos os pagamentos</CardTitle></CardHeader>
        <CardContent className="p-0">
          {payments.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Nenhum pagamento registrado ainda.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="p-3 text-left font-medium text-muted-foreground">Descrição</th>
                  <th className="p-3 text-right font-medium text-muted-foreground">Valor</th>
                  <th className="p-3 text-left font-medium text-muted-foreground">Vencimento</th>
                  <th className="p-3 text-left font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-t hover:bg-muted/20">
                    <td className="p-3">{p.description}</td>
                    <td className="p-3 text-right font-semibold">{formatBRL(p.amount)}</td>
                    <td className="p-3 text-muted-foreground text-xs">{formatDate(p.due_date)}</td>
                    <td className="p-3">
                      <Badge className={cn("text-xs", {
                        "bg-amber-100 text-amber-800": p.status === "pending",
                        "bg-emerald-100 text-emerald-800": p.status === "paid",
                        "bg-slate-100 text-slate-600": p.status === "cancelled",
                      })}>
                        {p.status === "pending" ? "Pendente" : p.status === "paid" ? "Pago" : "Cancelado"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Admin/Manager View ────────────────────────────────────────────────────────

function AdminView() {
  const { user } = useAuth();
  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(defaultMonth);
  const [pjs, setPjs] = useState<PJProfile[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [closures, setClosures] = useState<Closure[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPj, setExpandedPj] = useState<string | null>(null);
  const [closureNotes, setClosureNotes] = useState<Record<string, string>>({});
  const [closureBusy, setClosureBusy] = useState<string | null>(null);

  const { startISO, endISO, startDate, endDate, label: monthLabel } = monthBounds(month);

  const load = useCallback(async () => {
    setLoading(true);
    const [pjRes, payRes, taskRes, closRes] = await Promise.all([
      supabase.from("profiles").select("id,full_name,email,contract_type").eq("contract_type", "pj"),
      supabase.from("payments").select("*").or(
        `and(due_date.gte.${startDate},due_date.lt.${endDate}),and(due_date.is.null,created_at.gte.${startISO},created_at.lt.${endISO})`
      ),
      supabase.rpc("get_pj_tasks_for_report", {
        start_iso: startISO,
        end_iso: endISO,
      }),
      supabase.from("monthly_closures").select("*").eq("reference_month", month),
    ]);
    setPjs((pjRes.data ?? []) as PJProfile[]);
    setPayments((payRes.data ?? []) as PaymentRow[]);
    setTasks((taskRes.data ?? []) as TaskRow[]);
    setClosures((closRes.data ?? []) as Closure[]);
    setLoading(false);
  }, [month, startISO, endISO, startDate, endDate]);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo<PJRow[]>(() => pjs.map((pj) => {
    const pjPayments = payments.filter((p) => p.beneficiary_user_id === pj.id && p.status !== "cancelled");
    const pjTasks = tasks.filter((t) => t.assignee_id === pj.id);
    const completedTasks = pjTasks.length;
    const tasksWithValue = pjTasks.filter((t) => t.service_value && Number(t.service_value) > 0);
    const sumValues = tasksWithValue.reduce((s, t) => s + Number(t.service_value ?? 0), 0);
    const avgPerTask = tasksWithValue.length > 0 ? sumValues / tasksWithValue.length : 0;
    // Pagamentos manuais (sem task_id vinculado) entram direto no total
    const manualPayments = pjPayments.filter((p) => !p.task_id);
    const manualTotal = manualPayments.reduce((s, p) => s + Number(p.amount), 0);
    // Total to pay = soma dos valores das tarefas externas + pagamentos manuais
    const totalToPay = sumValues + manualTotal;
    // Pago = pagamentos com status "paid" (manuais ou vinculados a tarefas)
    const totalPaid = pjPayments.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.amount), 0);
    // Pendente = total a pagar menos o já pago
    const totalPending = Math.max(0, totalToPay - totalPaid);
    const closure = closures.find((c) => c.pj_user_id === pj.id) ?? null;
    return { pj, totalPending, totalPaid, totalToPay, completedTasks, avgPerTask, payments: pjPayments, tasks: pjTasks, closure };
  }).sort((a, b) => b.totalToPay - a.totalToPay), [pjs, payments, tasks, closures]);

  const grandTotals = useMemo(() => rows.reduce((acc, r) => ({
    pending: acc.pending + r.totalPending,
    paid: acc.paid + r.totalPaid,
    total: (acc.total ?? 0) + r.totalToPay,
    tasks: acc.tasks + r.completedTasks,
  }), { pending: 0, paid: 0, total: 0, tasks: 0 }), [rows]);

  const closeClosure = async (pjId: string, totalAmount: number, tasksCount: number) => {
    if (!user) return;
    setClosureBusy(pjId);
    const notes = closureNotes[pjId] ?? "";
    const existing = closures.find((c) => c.pj_user_id === pjId);
    if (existing) {
      const { error } = await supabase.from("monthly_closures").update({
        status: "closed", total_amount: totalAmount, tasks_count: tasksCount,
        notes: notes || null, closed_at: new Date().toISOString(), closed_by: user.id,
      }).eq("id", existing.id);
      if (error) { toast.error(error.message); setClosureBusy(null); return; }
    } else {
      const { error } = await supabase.from("monthly_closures").insert([{
        reference_month: month, pj_user_id: pjId, total_amount: totalAmount, tasks_count: tasksCount,
        status: "closed", notes: notes || null, closed_at: new Date().toISOString(), closed_by: user.id,
      }]);
      if (error) { toast.error(error.message); setClosureBusy(null); return; }
    }
    toast.success("Fechamento realizado!");
    setClosureBusy(null);
    void load();
  };

  const markPaid = async (pjId: string) => {
    if (!user) return;
    setClosureBusy(pjId);
    const existing = closures.find((c) => c.pj_user_id === pjId);
    if (!existing) { toast.error("Feche o mês antes de marcar como pago."); setClosureBusy(null); return; }
    // Apenas pagamentos do mês selecionado:
    //  - vinculados a tarefas APROVADAS/CONCLUÍDAS neste mês (presentes em `tasks`)
    //  - OU manuais (sem task_id) com vencimento no mês
    const monthTaskIds = new Set(tasks.filter((t) => t.assignee_id === pjId).map((t) => t.id));
    const idsToPay = payments
      .filter((p) => p.beneficiary_user_id === pjId && p.status === "pending")
      .filter((p) => (p.task_id ? monthTaskIds.has(p.task_id) : true))
      .map((p) => p.id);
    if (idsToPay.length > 0) {
      const { error: payErr } = await supabase.from("payments")
        .update({ status: "paid", paid_date: new Date().toISOString().slice(0, 10) })
        .in("id", idsToPay);
      if (payErr) { toast.error(payErr.message); setClosureBusy(null); return; }
    }
    const { error } = await supabase.from("monthly_closures").update({
      status: "paid", paid_at: new Date().toISOString(), paid_by: user.id,
    }).eq("id", existing.id);
    if (error) { toast.error(error.message); setClosureBusy(null); return; }
    toast.success(`Pagamento registrado! ${idsToPay.length} pagamento(s) deste mês marcado(s) como pago(s).`);
    setClosureBusy(null);
    void load();
  };

  const reopenClosure = async (pjId: string) => {
    if (!user) return;
    const existing = closures.find((c) => c.pj_user_id === pjId);
    if (!existing || existing.status === "paid") return;
    await supabase.from("monthly_closures").update({ status: "open", closed_at: null, closed_by: null }).eq("id", existing.id);
    toast.success("Fechamento reaberto.");
    void load();
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" /> Relatório PJ — {monthLabel}
          </h1>
          <p className="text-sm text-muted-foreground">Fechamento mensal, pagamentos e tarefas externas concluídas.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-[180px]" />
          <Button variant="outline" onClick={() => setMonth(defaultMonth)} size="sm">Mês atual</Button>
          <Button variant="outline" size="sm" onClick={() => exportCSV(rows, month)}>
            <FileDown className="h-4 w-4 mr-1" /> Exportar CSV
          </Button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard icon={Users} label="PJs ativos" value={String(pjs.length)} />
        <KpiCard icon={Wallet} label="A pagar (pendente)" value={formatBRL(grandTotals.pending)} accent="text-amber-700" />
        <KpiCard icon={CheckCircle2} label="Pago no mês" value={formatBRL(grandTotals.paid)} accent="text-emerald-700" />
        <KpiCard icon={TrendingUp} label="Tarefas concluídas" value={String(grandTotals.tasks)} />
        <KpiCard icon={BarChart3} label="Total do período" value={formatBRL(grandTotals.total ?? 0)} />
      </div>

      {/* Per-PJ table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Por prestador — {monthLabel}</span>
            <span className="text-xs font-normal text-muted-foreground">Clique na linha para ver detalhes e fechar</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Carregando...</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Nenhum PJ cadastrado.</div>
          ) : (
            <div>
              {rows.map((r) => (
                <PJRow
                  key={r.pj.id}
                  row={r}
                  expanded={expandedPj === r.pj.id}
                  onToggle={() => setExpandedPj(expandedPj === r.pj.id ? null : r.pj.id)}
                  notes={closureNotes[r.pj.id] ?? ""}
                  onNotesChange={(v) => setClosureNotes((n) => ({ ...n, [r.pj.id]: v }))}
                  busy={closureBusy === r.pj.id}
                  onClose={() => closeClosure(r.pj.id, r.totalToPay, r.completedTasks)}
                  onMarkPaid={() => markPaid(r.pj.id)}
                  onReopen={() => reopenClosure(r.pj.id)}
                  userId={user?.id ?? null}
                />
              ))}
              {/* Grand total row */}
              <div className="border-t bg-muted/20 flex items-center px-4 py-3 text-sm font-semibold">
                <span className="text-muted-foreground flex-1">Total geral</span>
                <div className="hidden sm:flex items-center gap-8 shrink-0">
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground font-normal">Tarefas</div>
                    <div>{grandTotals.tasks}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground font-normal">Pendente</div>
                    <div className="text-amber-700">{formatBRL(grandTotals.pending)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground font-normal">Pago</div>
                    <div className="text-emerald-700">{formatBRL(grandTotals.paid)}</div>
                  </div>
                  <div className="text-right min-w-[80px]">
                    <div className="text-xs text-muted-foreground font-normal">Total</div>
                    <div>{formatBRL(grandTotals.total ?? 0)}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PJRow({
  row, expanded, onToggle, notes, onNotesChange, busy, onClose, onMarkPaid, onReopen, userId,
}: {
  row: PJRow;
  expanded: boolean;
  onToggle: () => void;
  notes: string;
  onNotesChange: (v: string) => void;
  busy: boolean;
  onClose: () => void;
  onMarkPaid: () => void;
  onReopen: () => void;
  userId: string | null;
}) {
  const { closure } = row;
  const isClosed = closure?.status === "closed" || closure?.status === "paid";
  const { can } = useAuth();
  const isPaid = closure?.status === "paid";

  return (
    <div className="border-t">
      {/* Summary row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors"
        onClick={onToggle}
      >
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{row.pj.full_name ?? "—"}</div>
          <div className="text-xs text-muted-foreground">{row.pj.email ?? ""}</div>
        </div>
        <div className="hidden sm:flex items-center gap-6 text-sm shrink-0">
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Tarefas</div>
            <div className="font-medium">{row.completedTasks}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Pendente</div>
            <div className="font-medium text-amber-700">{formatBRL(row.totalPending)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Pago</div>
            <div className="font-medium text-emerald-700">{formatBRL(row.totalPaid)}</div>
          </div>
          <div className="text-right min-w-[80px]">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="font-semibold">{formatBRL(row.totalToPay)}</div>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <ClosureBadge status={closure?.status ?? "open"} />
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t bg-muted/10 p-4 space-y-4">

          {/* Tasks — rich cards */}
          {row.tasks.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-4">
              Nenhuma tarefa externa concluída neste mês.
            </div>
          ) : (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Tarefas concluídas — {row.tasks.length} tarefa{row.tasks.length !== 1 ? "s" : ""}
              </div>
              <div className="space-y-2">
                {row.tasks.map((t) => {
                  const taskPayment = row.payments.find((p) => p.task_id === t.id && p.status !== "cancelled");
                  const isPaidTask = taskPayment?.status === "paid";
                  const isPendingTask = !isPaidTask;
                  return (
                    <div key={t.id} className="rounded-lg border bg-background p-3 space-y-2">
                      {/* Title + value */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium leading-snug">{t.title}</div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Badge variant="outline" className={cn("text-[10px] px-1.5 h-4", {
                              "border-emerald-300 text-emerald-700": t.status === "done",
                              "border-amber-300 text-amber-700": t.status === "awaiting_approval",
                            })}>
                              {STATUS_LABEL[t.status] ?? t.status}
                            </Badge>
                            {t.completed_at && (
                              <span className="text-[11px] text-muted-foreground">
                                Concluída em {new Date(t.completed_at).toLocaleDateString("pt-BR")}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-base font-bold">
                            {t.service_value ? formatBRL(t.service_value) : "—"}
                          </div>
                          <Badge className={cn("text-[10px] px-1.5 h-4 mt-0.5", isPaidTask
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                          )}>
                            {isPaidTask ? "✓ Pago" : "⏳ Pendente"}
                          </Badge>
                        </div>
                      </div>

                      {/* Payment action if pending */}
                      {isPendingTask && t.service_value && !isPaid && (
                        <div className="flex items-center justify-between pt-1 border-t border-dashed">
                          <span className="text-xs text-muted-foreground">
                            {taskPayment
                              ? `Pagamento registrado em ${formatDate(taskPayment.due_date)}`
                              : "Nenhum pagamento registrado para esta tarefa"}
                          </span>
                          {!isClosed && (
                            <button
                              onClick={async () => {
                                if (!taskPayment) {
                                  // Create payment if it doesn't exist
                                  await supabase.from("payments").insert([{
                                    description: `Pagamento ref. tarefa: ${t.title}`,
                                    amount: Number(t.service_value),
                                    beneficiary_user_id: row.pj.id,
                                    beneficiary_name: row.pj.full_name,
                                    status: "pending",
                                    due_date: new Date().toISOString().slice(0, 10),
                                    task_id: t.id,
                                    created_by: userId,
                                  }]);
                                }
                                onMarkPaid();
                              }}
                              className="text-xs text-primary hover:underline font-medium flex items-center gap-1"
                            >
                              <CheckCircle2 className="h-3 w-3" /> Marcar como pago
                            </button>
                          )}
                        </div>
                      )}

                      {isPaidTask && taskPayment?.paid_date && (
                        <div className="text-[11px] text-emerald-700 pt-1 border-t border-dashed">
                          Pago em {new Date(taskPayment.paid_date).toLocaleDateString("pt-BR")}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pagamentos avulsos (manuais, sem task vinculada) */}
          {(() => {
            const manuals = row.payments.filter((p) => !p.task_id);
            if (manuals.length === 0) return null;
            return (
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Pagamentos avulsos — {manuals.length} lançamento{manuals.length !== 1 ? "s" : ""}
                </div>
                <div className="space-y-2">
                  {manuals.map((p) => (
                    <div key={p.id} className="rounded-lg border bg-background p-3 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium leading-snug">{p.description}</div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px] text-muted-foreground">
                          {p.due_date && <span>Vence: {formatDate(p.due_date)}</span>}
                          {p.paid_date && <span>• Pago: {formatDate(p.paid_date)}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-base font-bold">{formatBRL(p.amount)}</div>
                        <Badge className={cn("text-[10px] px-1.5 h-4 mt-0.5", {
                          "bg-emerald-100 text-emerald-800": p.status === "paid",
                          "bg-amber-100 text-amber-800": p.status === "pending",
                          "bg-slate-100 text-slate-700": p.status === "cancelled",
                        })}>
                          {p.status === "paid" ? "✓ Pago" : p.status === "pending" ? "⏳ Pendente" : "Cancelado"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Closure section */}
          <div className="rounded-lg border bg-background p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Fechamento do mês</div>
              <div className="text-lg font-bold">{formatBRL(row.totalToPay)}</div>
            </div>

            {!isClosed && (
              <div>
                <label className="text-xs text-muted-foreground">Observações (opcional)</label>
                <Textarea
                  className="mt-1 text-xs resize-none"
                  rows={2}
                  value={notes}
                  onChange={(e) => onNotesChange(e.target.value)}
                  placeholder="Ex: desconto de adiantamento, ajuste de valor..."
                />
              </div>
            )}

            {closure?.notes && isClosed && (
              <div className="text-xs text-muted-foreground bg-muted/40 rounded p-2">
                <span className="font-medium">Obs: </span>{closure.notes}
              </div>
            )}

            {isPaid && closure?.paid_at && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Pago em {formatDateTime(closure.paid_at)}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {can("reports.export") && <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => {
                  const pj = row.pj;
                  const tasks = row.tasks;
                  const payments = row.payments;
                  const manuals = payments.filter(p => !p.task_id && p.status !== "cancelled");
                  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório PJ — ${pj.full_name ?? pj.email}</title>
                    <style>
                      body{font-family:Arial,sans-serif;padding:32px;color:#111;max-width:800px;margin:0 auto}
                      h1{font-size:20px;margin:0 0 4px}
                      .sub{font-size:13px;color:#666;margin:0 0 24px}
                      .meta{float:right;font-size:11px;color:#888;text-align:right;line-height:1.8}
                      h2{font-size:14px;margin:24px 0 8px;padding-bottom:4px;border-bottom:2px solid #eee}
                      table{width:100%;border-collapse:collapse;margin:8px 0 16px}
                      th{background:#f0f0f0;text-align:left;padding:8px 12px;font-size:12px;border-bottom:2px solid #ccc}
                      td{padding:8px 12px;font-size:12px;border-bottom:1px solid #eee;vertical-align:top}
                      .right{text-align:right}.center{text-align:center}
                      .summary{margin-top:24px;margin-left:auto;width:300px;border:1px solid #ddd;border-radius:8px;overflow:hidden}
                      .summary td{border-bottom:1px solid #eee;font-size:13px}
                      .summary tr:last-child td{font-weight:bold;font-size:14px;background:#f9f9f9}
                      .pending{color:#b45309}.paid{color:#065f46}
                      .badge-paid{background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:12px;font-size:11px}
                      .badge-pend{background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:12px;font-size:11px}
                      @media print{@page{margin:20mm}}
                    </style></head><body>
                    <div class="meta">
                      Período: ${new Date().toLocaleDateString("pt-BR",{month:"long",year:"numeric"})}<br>
                      Gerado em: ${new Date().toLocaleString("pt-BR")}
                    </div>
                    <h1>${pj.full_name ?? "Prestador PJ"}</h1>
                    <p class="sub">${pj.email ?? ""}</p>

                    <h2>Tarefas concluídas</h2>
                    <table>
                      <thead><tr><th>Tarefa</th><th>Conclusão</th><th class="right">Valor</th><th class="center">Status</th></tr></thead>
                      <tbody>${tasks.length === 0 ? '<tr><td colspan="4" style="text-align:center;color:#999">Nenhuma tarefa no período</td></tr>' : tasks.map(t => {
                        const pay = payments.find(p => p.task_id === t.id && p.status !== "cancelled");
                        const val = t.service_value ? "R$ " + Number(t.service_value).toFixed(2).replace(".",",") : "—";
                        const date = t.completed_at ? new Date(t.completed_at).toLocaleDateString("pt-BR") : "—";
                        const badge = pay?.status === "paid" ? '<span class="badge-paid">✓ Pago</span>' : '<span class="badge-pend">⏳ Pendente</span>';
                        return `<tr><td>${t.title}</td><td>${date}</td><td class="right">${val}</td><td class="center">${badge}</td></tr>`;
                      }).join("")}</tbody>
                    </table>

                    ${manuals.length > 0 ? `
                    <h2>Pagamentos avulsos</h2>
                    <table>
                      <thead><tr><th>Descrição</th><th>Vencimento</th><th>Pagamento</th><th class="right">Valor</th><th class="center">Status</th></tr></thead>
                      <tbody>${manuals.map(p => {
                        const badge = p.status === "paid" ? '<span class="badge-paid">✓ Pago</span>' : '<span class="badge-pend">⏳ Pendente</span>';
                        const due = p.due_date ? new Date(p.due_date).toLocaleDateString("pt-BR") : "—";
                        const paid = p.paid_date ? new Date(p.paid_date).toLocaleDateString("pt-BR") : "—";
                        const val = "R$ " + Number(p.amount).toFixed(2).replace(".",",");
                        return `<tr><td>${p.description}</td><td>${due}</td><td>${paid}</td><td class="right">${val}</td><td class="center">${badge}</td></tr>`;
                      }).join("")}</tbody>
                    </table>` : ""}

                    <table class="summary">
                      <tr><td style="padding:8px 12px">Tarefas concluídas</td><td class="right" style="padding:8px 12px">${row.completedTasks}</td></tr>
                      ${manuals.length > 0 ? `<tr><td style="padding:8px 12px">Pagamentos avulsos</td><td class="right" style="padding:8px 12px">${manuals.length}</td></tr>` : ""}
                      <tr><td style="padding:8px 12px" class="pending">A receber</td><td class="right pending" style="padding:8px 12px">R$ ${row.totalPending.toFixed(2).replace(".",",")}</td></tr>
                      <tr><td style="padding:8px 12px" class="paid">Pago</td><td class="right paid" style="padding:8px 12px">R$ ${row.totalPaid.toFixed(2).replace(".",",")}</td></tr>
                      <tr><td style="padding:8px 12px">Total</td><td class="right" style="padding:8px 12px">R$ ${row.totalToPay.toFixed(2).replace(".",",")}</td></tr>
                    </table>
                    ${row.closure?.notes ? `<p style="margin-top:16px;font-size:12px;color:#666"><strong>Obs:</strong> ${row.closure.notes}</p>` : ""}
                    <script>window.onload=function(){window.print()}<\/script>
                  </body></html>`;
                  const blob = new Blob([html], { type: "text/html" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.target = "_blank";
                  a.rel = "noopener";
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  setTimeout(() => URL.revokeObjectURL(url), 10000);
                }}
              >
                <Printer className="h-3.5 w-3.5 mr-1" /> Imprimir / PDF
              </Button>}
              {!isClosed && (
                <Button size="sm" className="text-xs" onClick={onClose} disabled={busy || row.totalToPay === 0}>
                  <Lock className="h-3.5 w-3.5 mr-1" />
                  {busy ? "Fechando..." : "Fechar mês"}
                </Button>
              )}
              {isClosed && !isPaid && (
                <>
                  <Button size="sm" className="text-xs bg-emerald-600 hover:bg-emerald-700" onClick={onMarkPaid} disabled={busy}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                    {busy ? "Registrando..." : "Marcar como pago"}
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs" onClick={onReopen} disabled={busy}>
                    <Unlock className="h-3.5 w-3.5 mr-1" /> Reabrir
                  </Button>
                </>
              )}
              {isPaid && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
                  <CheckCircle2 className="h-4 w-4" /> Mês fechado e pago
                </div>
              )}
            </div>
          </div>

          {row.totalToPay === 0 && !isClosed && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              Nenhum valor registrado para este PJ neste mês. Verifique se as tarefas foram concluídas com valor de serviço.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ClosureBadge({ status }: { status: "open" | "closed" | "paid" | undefined }) {
  if (!status || status === "open") return <Badge variant="outline" className="text-[10px] px-1.5 h-5 text-muted-foreground">Em aberto</Badge>;
  if (status === "closed") return <Badge className="text-[10px] px-1.5 h-5 bg-blue-100 text-blue-800">Fechado</Badge>;
  return <Badge className="text-[10px] px-1.5 h-5 bg-emerald-100 text-emerald-800">Pago</Badge>;
}

function KpiCard({ icon: Icon, label, value, accent }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 grid place-items-center text-primary shrink-0">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className={cn("text-xl font-bold truncate", accent)}>{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Router ───────────────────────────────────────────────────────────────────

function ReportsPage() {
  const { user, isManagerOrAdmin, roles, can } = useAuth();
  const isPJ = !isManagerOrAdmin && roles.includes("member");

  if (!user) return null;
  if (isPJ) return <PJView userId={user.id} />;
  if (!isManagerOrAdmin) return <div className="text-sm text-muted-foreground">Acesso restrito.</div>;
  return <AdminView />;
}
