import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { Shield, Info, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/permissions")({
  component: PermissionsPage,
});

interface RolePerm {
  id: string;
  role: string;
  permission: string;
  enabled: boolean;
}

const ROLES = [
  { key: "admin",   label: "Admin",        color: "bg-purple-100 text-purple-800 border-purple-200" },
  { key: "manager", label: "Gestor",       color: "bg-teal-100 text-teal-800 border-teal-200" },
  { key: "member",  label: "Membro CLT",  color: "bg-blue-100 text-blue-800 border-blue-200" },
  { key: "pj",      label: "Prestador PJ", color: "bg-amber-100 text-amber-800 border-amber-200" },
];

const PERMISSIONS: { key: string; label: string; desc: string; group: string; adminOnly?: boolean }[] = [
  // Tarefas
  { key: "tasks.create",     label: "Criar tarefas",               desc: "Pode criar novas tarefas no sistema",                         group: "Tarefas" },
  { key: "tasks.view_all",   label: "Ver todas as tarefas",        desc: "Vê tarefas de outros membros (sem isso, só as próprias)",     group: "Tarefas" },
  { key: "tasks.delete_any", label: "Excluir qualquer tarefa",     desc: "Pode excluir tarefas que não criou",                          group: "Tarefas" },
  { key: "tasks.approve",    label: "Aprovar e concluir tarefas",  desc: "Pode clicar 'Aprovar e concluir' quando tarefa está em revisão", group: "Tarefas" },
  // Comunicação
  { key: "chat.access",      label: "Acesso ao chat da equipe",    desc: "Pode ler e enviar mensagens no chat interno",                 group: "Comunicação" },
  // Financeiro
  { key: "payments.manage",  label: "Gerenciar pagamentos",        desc: "Pode criar, editar e marcar pagamentos como pagos",           group: "Financeiro" },
  { key: "reports.view_all", label: "Ver relatório completo",      desc: "Vê dados financeiros de todos os PJs",                        group: "Financeiro" },
  // Configurações
  { key: "automations.edit", label: "Editar automações",           desc: "Pode criar e modificar automações do sistema",                group: "Configurações" },
  { key: "members.manage",   label: "Gerenciar membros",           desc: "Pode alterar papéis e tipo de contrato dos membros",          group: "Configurações", adminOnly: true },
];

const GROUPS = ["Tarefas", "Comunicação", "Financeiro", "Configurações"];

function PermissionsPage() {
  const { isAdmin } = useAuth();
  const [perms, setPerms] = useState<RolePerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("role_permissions" as never).select("*").order("role").order("permission");
    setPerms((data ?? []) as unknown as RolePerm[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center gap-3">
        <div className="h-12 w-12 rounded-full bg-rose-100 flex items-center justify-center">
          <Shield className="h-6 w-6 text-rose-600" />
        </div>
        <h2 className="text-lg font-semibold">Acesso restrito</h2>
        <p className="text-sm text-muted-foreground">Apenas administradores podem acessar o painel de permissões.</p>
      </div>
    );
  }

  const getPerm = (role: string, permission: string) =>
    perms.find((p) => p.role === role && p.permission === permission);

  const toggle = async (role: string, permission: string, currentEnabled: boolean) => {
    if (role === "admin") {
      toast.error("As permissões do Admin não podem ser alteradas.");
      return;
    }
    const key = `${role}:${permission}`;
    setSaving(key);
    const existing = getPerm(role, permission);
    let error;
    if (existing) {
      ({ error } = await (supabase.from("role_permissions" as never) as any)
        .update({ enabled: !currentEnabled, updated_at: new Date().toISOString() })
        .eq("id", existing.id));
    } else {
      ({ error } = await (supabase.from("role_permissions" as never) as any)
        .insert([{ role, permission, enabled: !currentEnabled }]));
    }
    if (error) { toast.error(error.message); setSaving(null); return; }
    setPerms((prev) => prev.map((p) =>
      p.role === role && p.permission === permission
        ? { ...p, enabled: !currentEnabled }
        : p
    ));
    setSaving(null);
    toast.success(`${!currentEnabled ? "Ativado" : "Desativado"}: ${role} → ${permission}`);
  };

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" /> Painel de permissões
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure o que cada papel pode fazer no sistema. Alterações têm efeito imediato no frontend.
        </p>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
        <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800 space-y-1">
          <div className="font-medium">Como funciona</div>
          <div>As permissões do frontend controlam o que aparece na interface. A segurança real é garantida pelo RLS do banco de dados — mesmo que alguém tente burlar o frontend, o banco bloqueia. As permissões aqui controlam a <strong>experiência</strong>, não a única linha de defesa.</div>
        </div>
      </div>

      {/* Warning for admin row */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
        Permissões do Admin são fixas e não podem ser alteradas.
      </div>

      {/* Permission table per group */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Carregando permissões...</div>
      ) : (
        GROUPS.map((group) => {
          const groupPerms = PERMISSIONS.filter((p) => p.group === group);
          return (
            <Card key={group}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{group}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/20">
                        <th className="text-left p-3 font-medium text-muted-foreground w-[40%]">Permissão</th>
                        {ROLES.map((r) => (
                          <th key={r.key} className="p-3 text-center font-medium">
                            <Badge variant="outline" className={cn("text-xs font-medium", r.color)}>
                              {r.label}
                            </Badge>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {groupPerms.map((perm) => (
                        <tr key={perm.key} className="border-b last:border-0 hover:bg-muted/10 transition-colors">
                          <td className="p-3">
                            <div className="font-medium text-sm">{perm.label}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">{perm.desc}</div>
                          </td>
                          {ROLES.map((role) => {
                            const p = getPerm(role.key, perm.key);
                            const enabled = p?.enabled ?? false;
                            const isAdminRole = role.key === "admin";
                            const isSaving = saving === `${role.key}:${perm.key}`;

                            return (
                              <td key={role.key} className="p-3 text-center">
                                {isAdminRole ? (
                                  <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto" />
                                ) : (
                                  <div className="flex justify-center">
                                    <Switch
                                      checked={enabled}
                                      onCheckedChange={() => toggle(role.key, perm.key, enabled)}
                                      disabled={isSaving}
                                      className={cn(isSaving && "opacity-50")}
                                    />
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
        {ROLES.map((role) => {
          const rolePerms = perms.filter((p) => p.role === role.key && p.enabled);
          const total = PERMISSIONS.filter((p) => !p.adminOnly || role.key === "admin").length;
          const active = role.key === "admin" ? total : rolePerms.length;
          return (
            <Card key={role.key}>
              <CardContent className="p-4">
                <Badge variant="outline" className={cn("text-xs mb-2", role.color)}>{role.label}</Badge>
                <div className="text-2xl font-bold">{active}<span className="text-sm font-normal text-muted-foreground">/{total}</span></div>
                <div className="text-xs text-muted-foreground">permissões ativas</div>
                <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${Math.round((active / total) * 100)}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
