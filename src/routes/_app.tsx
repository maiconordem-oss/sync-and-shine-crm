import { createFileRoute, Outlet, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import {
  LayoutDashboard,
  KanbanSquare,
  FolderKanban,
  Wallet,
  Workflow,
  Users,
  LogOut,
  CheckCircle2,
  Bell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ROLE_LABEL } from "@/lib/labels";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  managerOnly?: boolean;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/tasks", label: "Tarefas", icon: KanbanSquare },
  { to: "/projects", label: "Projetos", icon: FolderKanban },
  { to: "/payments", label: "Pagamentos", icon: Wallet },
  { to: "/automations", label: "Automações", icon: Workflow, managerOnly: true },
  { to: "/members", label: "Membros", icon: Users, adminOnly: true },
];

function AppLayout() {
  const { isAuthenticated, loading, profile, user, signOut, isAdmin, isManagerOrAdmin, roles } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) return;
    void supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("read", false)
      .then(({ count }) => setUnread(count ?? 0));
  }, [user, location.pathname]);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate({ to: "/auth" });
    }
  }, [loading, isAuthenticated, navigate]);

  if (loading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }

  const visibleNav = NAV.filter((n) => {
    if (n.adminOnly) return isAdmin;
    if (n.managerOnly) return isManagerOrAdmin;
    return true;
  });

  const displayRole = roles[0] ? ROLE_LABEL[roles[0]] : "Membro";

  return (
    <div className="min-h-screen flex bg-muted/30">
      {/* Sidebar */}
      <aside className="hidden md:flex w-60 flex-col border-r bg-sidebar text-sidebar-foreground">
        <div className="h-14 flex items-center gap-2 px-4 border-b font-semibold">
          <CheckCircle2 className="h-5 w-5 text-primary" /> FlowCRM
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {visibleNav.map((n) => {
            const active = location.pathname.startsWith(n.to);
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "hover:bg-sidebar-accent/60",
                )}
              >
                <Icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback>{initials(profile?.full_name)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{profile?.full_name ?? "Usuário"}</div>
            <div className="text-xs text-muted-foreground">{displayRole}</div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={async () => {
              await signOut();
              navigate({ to: "/auth" });
            }}
            title="Sair"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b bg-background flex items-center px-4 md:px-6 gap-3">
          <div className="md:hidden font-semibold flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" /> FlowCRM
          </div>
          <div className="flex-1" />
          <Link to="/notifications" className="relative">
            <Button variant="ghost" size="icon">
              <Bell className="h-4 w-4" />
            </Button>
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center">
                {unread}
              </span>
            )}
          </Link>
        </header>
        <main className="flex-1 p-4 md:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
