import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { CalendarClock, Pause, Play, Trash2, Pencil, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_app/scheduled-messages")({
  component: ScheduledMessagesPage,
});

type Recurrence = "once" | "daily" | "weekly" | "weekdays";
type TargetKind = "user" | "room" | "all";
type Status = "active" | "paused" | "cancelled" | "done";

interface ScheduledMessage {
  id: string;
  created_by: string;
  target_kind: TargetKind;
  target_user_id: string | null;
  content: string;
  recurrence: Recurrence;
  scheduled_at: string;
  status: Status;
  last_run_at: string | null;
  run_count: number;
  created_at: string;
}

interface ProfileLite {
  id: string;
  full_name: string | null;
}

const RECURRENCE_LABEL: Record<Recurrence, string> = {
  once: "Uma vez",
  daily: "Diariamente",
  weekly: "Semanalmente",
  weekdays: "Dias úteis",
};

const STATUS_LABEL: Record<Status, string> = {
  active: "Ativa",
  paused: "Pausada",
  cancelled: "Cancelada",
  done: "Concluída",
};

const STATUS_VARIANT: Record<Status, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  paused: "secondary",
  cancelled: "destructive",
  done: "outline",
};

function ScheduledMessagesPage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<ScheduledMessage[]>([]);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduledMessage | null>(null);

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/dashboard" });
  }, [loading, isAdmin, navigate]);

  const load = async () => {
    const [{ data: rows }, { data: profs }] = await Promise.all([
      supabase.from("scheduled_messages").select("*").order("scheduled_at", { ascending: true }),
      supabase.from("profiles").select("id,full_name"),
    ]);
    setItems((rows ?? []) as ScheduledMessage[]);
    setProfiles((profs ?? []) as ProfileLite[]);
  };

  useEffect(() => { if (isAdmin) void load(); }, [isAdmin]);

  const profileMap = useMemo(() => {
    const m = new Map<string, string>();
    profiles.forEach((p) => m.set(p.id, p.full_name ?? "—"));
    return m;
  }, [profiles]);

  const targetLabel = (m: ScheduledMessage) => {
    if (m.target_kind === "room" || m.target_kind === "all") return "Sala geral (todos)";
    return profileMap.get(m.target_user_id ?? "") ?? "Usuário";
  };

  const setStatus = async (id: string, status: Status) => {
    const { error } = await supabase.from("scheduled_messages").update({ status }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Atualizado"); void load(); }
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este agendamento?")) return;
    const { error } = await supabase.from("scheduled_messages").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Excluído"); void load(); }
  };

  if (loading || !user) return null;
  if (!isAdmin) return null;

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            Mensagens agendadas
          </h1>
          <p className="text-sm text-muted-foreground">Comunicados automáticos para usuários ou para a sala geral.</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="gap-1.5">
          <Plus className="h-4 w-4" /> Novo agendamento
        </Button>
      </div>

      <div className="border rounded-lg bg-card overflow-hidden">
        {items.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nenhuma mensagem agendada ainda.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Destinatário</th>
                <th className="text-left px-3 py-2">Mensagem</th>
                <th className="text-left px-3 py-2">Próxima execução</th>
                <th className="text-left px-3 py-2">Recorrência</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Execuções</th>
                <th className="text-right px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 whitespace-nowrap">{targetLabel(m)}</td>
                  <td className="px-3 py-2 max-w-[360px]">
                    <div className="truncate" title={m.content}>{m.content}</div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">{formatDateTime(m.scheduled_at)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">{RECURRENCE_LABEL[m.recurrence]}</td>
                  <td className="px-3 py-2">
                    <Badge variant={STATUS_VARIANT[m.status]}>{STATUS_LABEL[m.status]}</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs">{m.run_count}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1 justify-end">
                      {m.status === "active" && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Pausar" onClick={() => void setStatus(m.id, "paused")}>
                          <Pause className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {m.status === "paused" && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Retomar" onClick={() => void setStatus(m.id, "active")}>
                          <Play className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {(m.status === "active" || m.status === "paused") && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Cancelar" onClick={() => void setStatus(m.id, "cancelled")}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => { setEditing(m); setDialogOpen(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Excluir" onClick={() => void remove(m.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ScheduleDialog
        open={dialogOpen}
        onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null); }}
        profiles={profiles.filter((p) => p.id !== user.id)}
        currentUserId={user.id}
        editing={editing}
        onSaved={() => { setDialogOpen(false); setEditing(null); void load(); }}
      />
    </div>
  );
}

function toLocalInput(iso: string | null) {
  const d = iso ? new Date(iso) : new Date(Date.now() + 5 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ScheduleDialog({
  open, onOpenChange, profiles, currentUserId, editing, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  profiles: ProfileLite[];
  currentUserId: string;
  editing: ScheduledMessage | null;
  onSaved: () => void;
}) {
  const [targetKind, setTargetKind] = useState<TargetKind>("room");
  const [targetUserId, setTargetUserId] = useState<string>("");
  const [content, setContent] = useState("");
  const [recurrence, setRecurrence] = useState<Recurrence>("once");
  const [whenLocal, setWhenLocal] = useState<string>(toLocalInput(null));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTargetKind(editing.target_kind);
      setTargetUserId(editing.target_user_id ?? "");
      setContent(editing.content);
      setRecurrence(editing.recurrence);
      setWhenLocal(toLocalInput(editing.scheduled_at));
    } else {
      setTargetKind("room");
      setTargetUserId("");
      setContent("");
      setRecurrence("once");
      setWhenLocal(toLocalInput(null));
    }
  }, [open, editing]);

  const save = async () => {
    if (!content.trim()) { toast.error("Escreva a mensagem"); return; }
    if (targetKind === "user" && !targetUserId) { toast.error("Selecione o destinatário"); return; }
    const scheduledIso = new Date(whenLocal).toISOString();
    setSaving(true);
    const payload = {
      created_by: currentUserId,
      target_kind: targetKind,
      target_user_id: targetKind === "user" ? targetUserId : null,
      content: content.trim(),
      recurrence,
      scheduled_at: scheduledIso,
      status: "active" as Status,
    };
    const { error } = editing
      ? await supabase.from("scheduled_messages").update(payload).eq("id", editing.id)
      : await supabase.from("scheduled_messages").insert([payload]);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Agendamento atualizado" : "Mensagem agendada");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Editar agendamento" : "Nova mensagem agendada"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium block mb-1">Destinatário</label>
            <Select value={targetKind} onValueChange={(v) => setTargetKind(v as TargetKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="room">Sala geral</SelectItem>
                <SelectItem value="all">Todos os funcionários (sala geral)</SelectItem>
                <SelectItem value="user">Usuário específico</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {targetKind === "user" && (
            <div>
              <label className="text-xs font-medium block mb-1">Usuário</label>
              <Select value={targetUserId} onValueChange={setTargetUserId}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name ?? "—"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <label className="text-xs font-medium block mb-1">Mensagem</label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              placeholder="Bom dia! Lembrete do expediente..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium block mb-1">Data e hora</label>
              <Input
                type="datetime-local"
                value={whenLocal}
                onChange={(e) => setWhenLocal(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Recorrência</label>
              <Select value={recurrence} onValueChange={(v) => setRecurrence(v as Recurrence)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">Uma vez</SelectItem>
                  <SelectItem value="daily">Diariamente</SelectItem>
                  <SelectItem value="weekdays">Dias úteis (seg–sex)</SelectItem>
                  <SelectItem value="weekly">Semanalmente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            A primeira execução acontece na data/hora informada. Para recorrentes, a próxima ocorrência é calculada automaticamente após o disparo.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => void save()} disabled={saving} className={cn(saving && "opacity-70")}>
            {editing ? "Salvar" : "Agendar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
