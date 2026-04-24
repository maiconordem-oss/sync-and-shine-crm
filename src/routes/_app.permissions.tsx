import { createFileRoute } from "@tanstack/react-router";
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

const PERMISSIONS = [
  { key: "tasks.create",     label: "Criar tarefas",               desc: "Pode criar novas tarefas no sistema",                          group: "Tarefas" },
  { key: "tasks.view_all",   label: "Ver todas as tarefas",        desc: "Vê tarefas de outros membros (sem isso, só as próprias)",      group: "Tarefas" },
  { key: "tasks.delete_any", label: "Excluir qualquer tarefa",     desc: "Pode excluir tarefas que não criou",                           group: "Tarefas" },
  { key: "tasks.approve",    label: "Aprovar e concluir tarefas",  desc: "Pode clicar Aprovar quando tarefa está em revisão",            group: "Tarefas" },
  { key: "chat.access",      label: "Acesso ao chat da equipe",    desc: "Pode ler e enviar mensagens no chat interno",                  group: "Comunicação" },
  { key: "payments.manage",  label: "Gerenciar pagamentos",        desc: "Pode criar, editar e marcar pagamentos como pagos",            group: "Financeiro" },
  { key: "reports.view_all", label: "Ver relatório completo",      desc: "Vê dados financeiros de todos os PJs",                         group: "Financeiro" },
  { key: "automations.edit", label: "Editar automações",           desc: "Pode criar e modificar automações do sistema",                 group: "Configurações" },
  { key: "members.manage",   label: "Gerenciar membros",           desc: "Pode alterar papéis e tipo de contrato dos membros",           group: "Configurações" },
];

const GROUPS = ["Tarefas", "Comunicação", "Financeiro", "Configurações"];

// ── Defaults shown when table doesn't exist yet ────────────────
const DEFAULT_ENABLED: Record<string, string[]> = {
  admin:   ["tasks.create","tasks.view_all","tasks.delete_any","tasks.approve","chat.access","payments.manage","reports.view_all","automations.edit","members.manage"],
  manager: ["tasks.create","tasks.view_all","tasks.delete_any","tasks.approve","chat.access","payments.manage","reports.view_all","automations.edit"],
  member:  ["tasks.create","chat.access"],
  pj:      [],
};

function PermissionsPage() {
  const { isAdmin } = useAuth();
  const [perms, setPerms] = useState<RolePerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableReady, setTableReady] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("role_permissions")
      .select("*")
      .order("role")
      .order("permission");
    if (error) {
      console.error("[permissions] load error:", error);
      setTableReady(false);
      const defaultPerms: RolePerm[] = [];
      for (const [role, keys] of Object.entries(DEFAULT_ENABLED)) {
        for (const p of PERMISSIONS) {
          defaultPerms.push({ id: `${role}:${p.key}`, role, permission: p.key, enabled: keys.includes(p.key) });
        }
      }
      setPerms(defaultPerms);
    } else {
      setTableReady(true);
      setPerms((data ?? []) as RolePerm[]);
    }
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
    if (role === "admin") { toast.error("Permissões do Admin não podem ser alteradas."); return; }
    if (!tableReady) { toast.error("Tabela de permissões indisponível."); return; }
    const key = `${role}:${permission}`;
    setSaving(key);
    const existing = getPerm(role, permission);
    const { error } = existing && !existing.id.includes(":")
      ? await supabase.from("role_permissions").update({ enabled: !currentEnabled, updated_at: new Date().toISOString() }).eq("id", existing.id)
      : await supabase.from("role_permissions").upsert([{ role, permission, enabled: !currentEnabled }], { onConflict: "role,permission" });
    if (error) { toast.error(error.message); setSaving(null); return; }
    await load();
    toast.success(`${!currentEnabled ? "✓ Ativado" : "✗ Desativado"}: ${role} → ${permission}`);
    setSaving(null);
  };

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" /> Painel de permissões
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure o que cada papel pode fazer. Alterações têm efeito imediato no frontend.
        </p>
      </div>

      {/* Migration warning */}
      {!tableReady && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <div className="font-medium mb-1">Migration pendente — visualização somente leitura</div>
            <p>A tabela <code className="bg-amber-100 px-1 rounded">role_permissions</code> ainda não existe. Para ativar edição:</p>
            <ol className="list-decimal list-inside mt-1 space-y-0.5 text-xs">
              <li>Supabase Dashboard → SQL Editor</li>
              <li>Execute: <code className="bg-amber-100 px-1 rounded">supabase/migrations/20260425400001_fix_permissions_and_panel.sql</code></li>
              <li>Recarregue esta página</li>
            </ol>
          </div>
        </div>
      )}

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
        <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-800">
          <span className="font-medium">Como funciona: </span>
          Estas permissões controlam a <strong>interface</strong>. A segurança real é garantida pelo RLS do banco de dados — o banco bloqueia mesmo que alguém tente burlar o frontend.
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
        Permissões do Admin são fixas e não podem ser alteradas.
      </div>

      {/* Permission tables per group */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Carregando...</div>
      ) : (
        GROUPS.map((group) => (
          <Card key={group}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{group}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/20">
                      <th className="text-left p-3 font-medium text-muted-foreground w-[38%]">Permissão</th>
                      {ROLES.map((r) => (
                        <th key={r.key} className="p-3 text-center font-medium w-[15%]">
                          <Badge variant="outline" className={cn("text-xs font-medium", r.color)}>
                            {r.label}
                          </Badge>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PERMISSIONS.filter((p) => p.group === group).map((perm) => (
                      <tr key={perm.key} className="border-b last:border-0 hover:bg-muted/10 transition-colors">
                        <td className="p-3">
                          <div className="font-medium text-sm">{perm.label}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{perm.desc}</div>
                        </td>
                        {ROLES.map((role) => {
                          const p = getPerm(role.key, perm.key);
                          const enabled = p?.enabled ?? false;
                          const isSaving = saving === `${role.key}:${perm.key}`;
                          return (
                            <td key={role.key} className="p-3 text-center">
                              {role.key === "admin" ? (
                                <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto" />
                              ) : (
                                <Switch
                                  checked={enabled}
                                  onCheckedChange={() => toggle(role.key, perm.key, enabled)}
                                  disabled={isSaving || !tableReady}
                                  className={cn(isSaving && "opacity-50")}
                                />
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
        ))
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
        {ROLES.map((role) => {
          const rolePerms = perms.filter((p) => p.role === role.key && p.enabled);
          const total = PERMISSIONS.length;
          const active = role.key === "admin" ? total : rolePerms.length;
          return (
            <Card key={role.key}>
              <CardContent className="p-4">
                <Badge variant="outline" className={cn("text-xs mb-2", role.color)}>{role.label}</Badge>
                <div className="text-2xl font-bold">
                  {active}
                  <span className="text-sm font-normal text-muted-foreground">/{total}</span>
                </div>
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
