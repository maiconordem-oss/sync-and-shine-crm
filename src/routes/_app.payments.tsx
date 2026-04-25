import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Wallet, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { formatBRL, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { PAYMENT_STATUS_LABEL } from "@/lib/labels";

type PayStatus = "pending" | "paid" | "cancelled";

interface Payment {
  id: string;
  description: string;
  amount: number;
  beneficiary_user_id: string | null;
  beneficiary_name: string | null;
  status: PayStatus;
  due_date: string | null;
  paid_date: string | null;
  created_at: string;
}

export const Route = createFileRoute("/_app/payments")({
  component: PaymentsPage,
});

const STATUS_BADGE: Record<PayStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-slate-100 text-slate-700",
};

function PaymentsPage() {
  const { user, isManagerOrAdmin, can, isAdmin } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [profiles, setProfiles] = useState<{ id: string; full_name: string | null }[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ description: "", amount: "", beneficiary_user_id: "none", beneficiary_name: "", due_date: "" });

  const load = async () => {
    const [p, pr] = await Promise.all([
      supabase.from("payments").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id,full_name"),
    ]);
    setPayments((p.data ?? []) as Payment[]);
    setProfiles((pr.data ?? []) as { id: string; full_name: string | null }[]);
  };
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(
    () => payments.filter((p) => {
      if (filterStatus === "all") return true;
      if (filterStatus === "active") return p.status !== "cancelled";
      return p.status === filterStatus;
    }),
    [payments, filterStatus],
  );

  const totals = useMemo(() => {
    const t = { pending: 0, paid: 0, cancelled: 0 };
    payments.forEach((p) => { t[p.status] += Number(p.amount); });
    return t;
  }, [payments]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("payments").insert([{
      description: form.description,
      amount: Number(form.amount),
      beneficiary_user_id: form.beneficiary_user_id === "none" ? null : form.beneficiary_user_id,
      beneficiary_name: form.beneficiary_name || null,
      due_date: form.due_date || null,
      created_by: user.id,
    }]);
    if (error) { toast.error(error.message); return; }
    setOpen(false);
    setForm({ description: "", amount: "", beneficiary_user_id: "none", beneficiary_name: "", due_date: "" });
    toast.success("Pagamento criado!");
    void load();
  };

  const setStatus = async (id: string, status: PayStatus) => {
    const patch: { status: PayStatus; paid_date?: string | null } = { status };
    if (status === "paid") patch.paid_date = new Date().toISOString().slice(0, 10);
    if (status !== "paid") patch.paid_date = null;
    const { error } = await supabase.from("payments").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    void load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("payments").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Pagamento excluído!");
    void load();
  };

  const removeAllCancelled = async () => {
    const ids = payments.filter((p) => p.status === "cancelled").map((p) => p.id);
    if (ids.length === 0) { toast.info("Nenhum cancelado para excluir."); return; }
    const { error } = await supabase.from("payments").delete().in("id", ids);
    if (error) { toast.error(error.message); return; }
    toast.success(`${ids.length} pagamento(s) cancelado(s) excluído(s)!`);
    void load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Pagamentos</h1>
          <p className="text-sm text-muted-foreground">Controle financeiro vinculado às tarefas.</p>
        </div>
        {isManagerOrAdmin && can("payments.manage") && (
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Novo pagamento</Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <TotalCard label="Pendente" amount={totals.pending} accent="text-amber-700" />
        <TotalCard label="Pago" amount={totals.paid} accent="text-emerald-700" />
        <TotalCard label="Cancelado" amount={totals.cancelled} accent="text-slate-600" />
      </div>

      <Card>
        <CardContent className="p-3 flex items-center gap-2 flex-wrap">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="active">Ativos (sem cancelados)</SelectItem>
              {Object.entries(PAYMENT_STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          {isAdmin && totals.cancelled > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="ml-auto">
                  <Trash2 className="h-4 w-4 mr-1" /> Limpar cancelados
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir todos os cancelados?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação removerá permanentemente todos os pagamentos com status &quot;Cancelado&quot;.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void removeAllCancelled()}>Excluir</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-3 font-medium">Descrição</th>
                <th className="p-3 font-medium">Beneficiário</th>
                <th className="p-3 font-medium">Valor</th>
                <th className="p-3 font-medium">Vencimento</th>
                <th className="p-3 font-medium">Status</th>
                {isManagerOrAdmin && <th className="p-3 font-medium">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const benef = profiles.find((x) => x.id === p.beneficiary_user_id);
                return (
                  <tr key={p.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 font-medium">{p.description}</td>
                    <td className="p-3">{benef?.full_name ?? p.beneficiary_name ?? "—"}</td>
                    <td className="p-3">{formatBRL(p.amount)}</td>
                    <td className="p-3">{formatDate(p.due_date)}</td>
                    <td className="p-3"><Badge className={STATUS_BADGE[p.status]}>{PAYMENT_STATUS_LABEL[p.status]}</Badge></td>
                    {isManagerOrAdmin && (
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Select value={p.status} onValueChange={(v) => void setStatus(p.id, v as PayStatus)}>
                            <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Object.entries(PAYMENT_STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {isAdmin && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-600 hover:text-rose-700">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir pagamento?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    &quot;{p.description}&quot; será removido permanentemente.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => void remove(p.id)}>Excluir</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nenhum pagamento.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo pagamento</DialogTitle></DialogHeader>
          <form onSubmit={create} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Descrição *</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valor (R$) *</Label>
                <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label>Vencimento</Label>
                <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Beneficiário (membro)</Label>
              <Select value={form.beneficiary_user_id} onValueChange={(v) => setForm({ ...form, beneficiary_user_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— externo —</SelectItem>
                  {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name ?? "—"}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nome (se externo)</Label>
              <Input value={form.beneficiary_name} onChange={(e) => setForm({ ...form, beneficiary_name: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={!form.description || !form.amount}>Criar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TotalCard({ label, amount, accent }: { label: string; amount: number; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 grid place-items-center text-primary"><Wallet className="h-5 w-5" /></div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className={`text-xl font-bold ${accent ?? ""}`}>{formatBRL(amount)}</div>
        </div>
      </CardContent>
    </Card>
  );
}
