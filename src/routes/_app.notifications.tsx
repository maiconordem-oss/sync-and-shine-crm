import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/notifications")({
  component: NotificationsPage,
});

interface N {
  id: string; type: string; title: string; body: string | null;
  task_id: string | null; read: boolean; created_at: string;
}

function NotificationsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<N[]>([]);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setItems((data ?? []) as N[]);
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [user]);

  const markAll = async () => {
    if (!user) return;
    await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
    void load();
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notificações</h1>
          <p className="text-sm text-muted-foreground">Suas alertas e menções.</p>
        </div>
        <Button variant="outline" size="sm" onClick={markAll}>Marcar todas como lidas</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">Nenhuma notificação.</div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li key={n.id} className={cn("p-4 flex gap-3", !n.read && "bg-primary/5")}>
                  <div className="h-8 w-8 rounded-full bg-primary/10 grid place-items-center text-primary"><Bell className="h-4 w-4" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{n.title}</div>
                    {n.body && <div className="text-sm text-muted-foreground">{n.body}</div>}
                    <div className="text-xs text-muted-foreground mt-1">{formatDateTime(n.created_at)}</div>
                  </div>
                  {n.task_id && (
                    <Link to="/tasks/$taskId" params={{ taskId: n.task_id }} className="text-xs text-primary hover:underline self-center">
                      Ver tarefa
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
