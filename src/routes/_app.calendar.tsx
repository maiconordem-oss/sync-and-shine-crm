import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { PRIORITY_COLOR, STATUS_COLOR, STATUS_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, CalendarDays, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/calendar")({
  component: CalendarPage,
});

interface TaskLite {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  assignee_id: string | null;
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function CalendarPage() {
  const { user, isManagerOrAdmin } = useAuth();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [tasks, setTasks] = useState<TaskLite[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const load = async () => {
    const start = new Date(year, month, 1).toISOString();
    const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
    const [t, p] = await Promise.all([
      supabase.from("tasks").select("id,title,status,priority,due_date,assignee_id")
        .not("due_date", "is", null)
        .gte("due_date", start).lte("due_date", end)
        .is("parent_task_id", null),
      supabase.from("profiles").select("id,full_name"),
    ]);
    setTasks((t.data ?? []) as TaskLite[]);
    const map: Record<string, string> = {};
    ((p.data ?? []) as { id: string; full_name: string | null }[]).forEach((pr) => {
      map[pr.id] = pr.full_name ?? "—";
    });
    setProfiles(map);
  };

  useEffect(() => { void load(); }, [year, month, user]);

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  // Build calendar grid
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const tasksByDay = (day: number) =>
    tasks.filter((t) => t.due_date && new Date(t.due_date).getDate() === day);

  const handleDrop = async (day: number) => {
    if (!draggingId) return;
    const date = new Date(year, month, day, 12, 0, 0);
    const { error } = await supabase.from("tasks").update({ due_date: date.toISOString() }).eq("id", draggingId);
    if (error) { toast.error(error.message); return; }
    setTasks((prev) => prev.map((t) => t.id === draggingId ? { ...t, due_date: date.toISOString() } : t));
    toast.success("Prazo atualizado!");
    setDraggingId(null);
  };

  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const isOverdue = (task: TaskLite, day: number) =>
    task.status !== "done" && new Date(year, month, day) < today && day !== today.getDate();

  const selectedTasks = selectedDay ? tasksByDay(selectedDay) : [];

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-primary" /> Calendário
          </h1>
          <p className="text-sm text-muted-foreground">
            {tasks.length} tarefas com prazo em {MONTHS[month]} {year}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }}>
            Hoje
          </Button>
          <div className="flex items-center gap-1 border rounded-lg p-0.5">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={prevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium px-2 min-w-[140px] text-center">
              {MONTHS[month]} {year}
            </span>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={nextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Calendar grid */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map((d) => (
              <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">
                {d}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-px bg-border rounded-xl overflow-hidden flex-1">
            {cells.map((day, i) => {
              const dayTasks = day ? tasksByDay(day) : [];
              const isSelected = day === selectedDay;
              return (
                <div
                  key={i}
                  onDragOver={(e) => day && e.preventDefault()}
                  onDrop={() => day && handleDrop(day)}
                  onClick={() => { if (day) setSelectedDay(day === selectedDay ? null : day); }}
                  className={cn(
                    "bg-background min-h-[90px] p-1.5 cursor-pointer transition-colors",
                    !day && "bg-muted/20 cursor-default",
                    day && "hover:bg-muted/30",
                    isSelected && "bg-primary/5 ring-1 ring-primary ring-inset",
                  )}
                >
                  {day && (
                    <>
                      {/* Day number */}
                      <div className={cn(
                        "h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium mb-1",
                        isToday(day) ? "bg-primary text-primary-foreground" : "text-foreground",
                      )}>
                        {day}
                      </div>

                      {/* Tasks */}
                      <div className="space-y-0.5">
                        {dayTasks.slice(0, 3).map((t) => (
                          <div
                            key={t.id}
                            draggable={isManagerOrAdmin}
                            onDragStart={() => setDraggingId(t.id)}
                            onDragEnd={() => setDraggingId(null)}
                            className={cn(
                              "text-[10px] rounded px-1 py-0.5 truncate cursor-grab active:cursor-grabbing",
                              t.priority === "urgent" ? "bg-rose-100 text-rose-800" :
                              t.priority === "high" ? "bg-amber-100 text-amber-800" :
                              t.priority === "medium" ? "bg-blue-100 text-blue-800" :
                              "bg-slate-100 text-slate-700",
                              isOverdue(t, day) && "ring-1 ring-rose-400",
                              draggingId === t.id && "opacity-40",
                            )}
                            title={t.title}
                          >
                            {isOverdue(t, day) && "⚠ "}{t.title}
                          </div>
                        ))}
                        {dayTasks.length > 3 && (
                          <div className="text-[10px] text-muted-foreground px-1">
                            +{dayTasks.length - 3} mais
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Day detail panel */}
        {selectedDay && (
          <div className="w-72 shrink-0 border rounded-xl bg-background flex flex-col overflow-hidden">
            <div className="p-3 border-b bg-muted/10">
              <div className="font-semibold text-sm">
                {selectedDay} de {MONTHS[month]} de {year}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {selectedTasks.length === 0 ? "Nenhuma tarefa" : `${selectedTasks.length} tarefa${selectedTasks.length > 1 ? "s" : ""}`}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {selectedTasks.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  Nenhuma tarefa neste dia.
                </div>
              )}
              {selectedTasks.map((t) => (
                <div key={t.id} className="rounded-lg border bg-card p-3 hover:border-primary/30 transition-colors">
                  <div className="text-sm font-medium leading-snug mb-2">{t.title}</div>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline" className={cn("text-[10px] px-1.5 h-4", STATUS_COLOR[t.status])}>
                      {STATUS_LABEL[t.status] ?? t.status}
                    </Badge>
                    <Badge className={cn("text-[10px] px-1.5 h-4", PRIORITY_COLOR[t.priority])}>
                      {t.priority}
                    </Badge>
                  </div>
                  {t.assignee_id && profiles[t.assignee_id] && (
                    <div className="text-[11px] text-muted-foreground mt-1.5">
                      Responsável: {profiles[t.assignee_id]}
                    </div>
                  )}
                  {isOverdue(t, selectedDay) && (
                    <div className="flex items-center gap-1 text-[11px] text-rose-600 mt-1.5 font-medium">
                      <AlertTriangle className="h-3 w-3" /> Prazo vencido
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
