import { GlobalSearch } from "@/components/global-search";
import { createFileRoute, Outlet, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import {
  LayoutDashboard,
  KanbanSquare,
  FolderKanban,
  Wallet,
  Workflow,
  BarChart3,
  Users,
  MessageSquare,
  LogOut,
  CheckCircle2,
  Bell,
  Volume2,
  VolumeX,
  Search,
  PanelLeftClose,
  ShieldCheck,
  CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ROLE_LABEL } from "@/lib/labels";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  managerOnly?: boolean;
  adminOnly?: boolean;
  permKey?: string; // role_permissions key
}

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/tasks", label: "Tarefas", icon: KanbanSquare },
  { to: "/projects", label: "Projetos", icon: FolderKanban },
  { to: "/payments", label: "Pagamentos", icon: Wallet, permKey: "payments.manage" },
  { to: "/reports", label: "Relatórios", icon: BarChart3, permKey: "reports.view_all" },
  { to: "/chat", label: "Chat", icon: MessageSquare, permKey: "chat.access" },
  { to: "/automations", label: "Automações", icon: Workflow, managerOnly: true, permKey: "automations.edit" },
  { to: "/members", label: "Membros", icon: Users, adminOnly: true, permKey: "members.manage" },
  { to: "/permissions", label: "Permissões", icon: ShieldCheck, adminOnly: true },
];

function AppLayout() {
  const { isAuthenticated, loading, profile, user, signOut, isAdmin, isManagerOrAdmin, roles, can } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [unread, setUnread] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);

  // Initial unread count
  useEffect(() => {
    if (!user) return;
    void supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("read", false)
      .then(({ count }) => setUnread(count ?? 0));
  }, [user, location.pathname]);

  // Realtime: badge atualiza ao vivo quando chega nova notificação
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("notifications_badge_" + user.id)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, () => {
        setUnread((n) => n + 1);
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, () => {
        void supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("read", false)
          .then(({ count }) => setUnread(count ?? 0));
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user]);

  // Ctrl+K global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

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
    if (n.managerOnly && !isManagerOrAdmin) return false;
    if (n.permKey && !can(n.permKey)) return false;
    return true;
  });

  const displayRole = roles[0] ? ROLE_LABEL[roles[0]] : "Membro";

  return (
    <SidebarProvider defaultOpen>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar
          visibleNav={visibleNav}
          pathname={location.pathname}
          profileName={profile?.full_name ?? "Usuário"}
          displayRole={displayRole}
          onSignOut={async () => {
            await signOut();
            navigate({ to: "/auth" });
          }}
        />

        <SidebarInset className="min-w-0 bg-background">
          <header className="flex h-14 items-center gap-3 border-b bg-card px-4 md:px-6">
            <SidebarTrigger className="text-muted-foreground" />
            <button
              onClick={() => setSearchOpen(true)}
              className="hidden min-w-[220px] max-w-[380px] flex-1 md:flex items-center gap-2 h-9 rounded-md border border-border/80 bg-background px-3 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">Buscar tarefas, projetos...</span>
              <kbd className="hidden lg:inline-flex h-5 items-center gap-0.5 rounded border bg-muted px-1 text-[10px] font-medium opacity-60">
                Ctrl K
              </kbd>
            </button>
            <div className="ml-auto flex items-center gap-2">
              <SoundToggleBtn />
          <Link to="/notifications" className="relative">
                <Button variant="ghost" size="icon" className="rounded-md">
                  <Bell className="h-4 w-4" />
                </Button>
                {unread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 rounded-full bg-destructive px-1 text-[10px] text-destructive-foreground flex items-center justify-center">
                    {unread}
                  </span>
                )}
              </Link>
              <Link to="/profile" className="hidden items-center gap-2 rounded-md border bg-background px-2 py-1.5 md:flex hover:border-primary/40 transition-colors" title="Meu perfil">
                <Avatar className="h-7 w-7">
                  {profile?.avatar_url && <img src={profile.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />}
                  <AvatarFallback>{initials(profile?.full_name)}</AvatarFallback>
                </Avatar>
                <div className="leading-none">
                  <div className="text-sm font-medium">{profile?.full_name ?? "Usuário"}</div>
                  <div className="text-[11px] text-muted-foreground">{displayRole}</div>
                </div>
              </Link>
            </div>
          </header>

          <main className="flex-1 overflow-hidden bg-background p-4 md:p-6 flex flex-col">
            <Outlet />
          </main>
          <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

function AppSidebar({
  visibleNav,
  pathname,
  profileName,
  displayRole,
  onSignOut,
}: {
  visibleNav: NavItem[];
  pathname: string;
  profileName: string;
  displayRole: string;
  onSignOut: () => Promise<void>;
}) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="gap-3 px-3 py-4">
        <div className="flex items-center gap-3 rounded-md px-2 text-sidebar-foreground">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-sm font-semibold">FlowCRM</div>
              <div className="text-[11px] text-sidebar-foreground/75">Workspace</div>
            </div>
          )}
        </div>
        {!collapsed && (
          <div className="relative px-1">
            <Search className="absolute left-4 top-2.5 h-4 w-4 text-sidebar-foreground/70" />
            <Input className="h-9 border-white/15 bg-white/10 pl-9 text-sidebar-foreground placeholder:text-sidebar-foreground/65" placeholder="Pesquisar menu" />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleNav.map((n) => {
                const active = pathname.startsWith(n.to);
                const Icon = n.icon;
                return (
                  <SidebarMenuItem key={n.to}>
                    <SidebarMenuButton asChild isActive={active} tooltip={n.label} className="h-10 rounded-md px-3">
                      <Link to={n.to}>
                        <Icon className="h-4 w-4" />
                        <span>{n.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator />

      <SidebarFooter className="p-3">
        <div className="flex items-center gap-3 rounded-md bg-white/10 px-2 py-2 text-sidebar-foreground">
          <Avatar className="h-8 w-8 border border-white/20">
            <AvatarFallback className="bg-white/15 text-sidebar-foreground">{initials(profileName)}</AvatarFallback>
          </Avatar>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{profileName}</div>
                <div className="text-[11px] text-sidebar-foreground/70">{displayRole}</div>
              </div>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-sidebar-foreground hover:bg-white/15 hover:text-sidebar-foreground" onClick={() => void onSignOut()}>
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
        {collapsed && (
          <Button type="button" variant="ghost" size="icon" className="mx-auto h-8 w-8 text-sidebar-foreground hover:bg-white/15 hover:text-sidebar-foreground" onClick={() => void onSignOut()}>
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        )}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function SoundToggleBtn() {
  const { soundEnabled, setSoundEnabled } = useAuth();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="rounded-md"
      onClick={() => void setSoundEnabled(!soundEnabled)}
      title={soundEnabled ? "Silenciar sons" : "Ativar sons"}
    >
      {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
    </Button>
  );
}
