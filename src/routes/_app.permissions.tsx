import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { Shield, Info, AlertTriangle, CheckCircle2, X, History, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/permissions")({
  component: PermissionsPage,
});

interface RolePerm {
  id: string;
  role: string;
  permission: string;
  enabled: boolean;
  updated_at?: string;
  updated_by?: string | null;
}

const ROLES = [
  { key: "admin",   label: "Admin",        color: "bg-purple-100 text-purple-800 border-purple-200", desc: "Acesso total ao sistema" },
  { key: "manager", label: "Gestor",       color: "bg-teal-100 text-teal-800 border-teal-200",       desc: "Gerencia equipe e aprova tarefas" },
  { key: "member",  label: "Membro CLT",   color: "bg-blue-100 text-blue-800 border-blue-200",       desc: "Executa tarefas internas" },
  { key: "pj",      label: "Prestador PJ", color: "bg-amber-100 text-amber-800 border-amber-200",    desc: "Executa tarefas externas" },
];

const PERMISSIONS = [
  // Tarefas
  { key: "tasks.create",      label: "Criar tarefas",              desc: "Pode criar novas tarefas",                                  group: "Tarefas",       risk: "low" },
  { key: "tasks.view_all",    label: "Ver tarefas de outros",      desc: "Vê tarefas que não criou e não foi atribuído",              group: "Tarefas",       risk: "medium" },
  { key: "tasks.edit_own",    label: "Editar suas tarefas",        desc: "Pode editar tarefas que criou",                             group: "Tarefas",       risk: "low" },
  { key: "tasks.delete_any",  label: "Excluir qualquer tarefa",    desc: "Exclui tarefas que não criou",                              group: "Tarefas",       risk: "high" },
  { key: "tasks.approve",     label: "Aprovar tarefas",            desc: "Clica em Aprovar e concluir em revisão",                    group: "Tarefas",       risk: "medium" },
  { key: "tasks.use_timer",   label: "Usar timer de tempo",        desc: "Pode iniciar e parar o contador de horas",                  group: "Tarefas",       risk: "low" },
  { key: "tasks.use_templates", label: "Usar modelos de tarefa",   desc: "Pode aplicar templates ao criar tarefas",                   group: "Tarefas",       risk: "low" },
  // Comunicação
  { key: "chat.access",       label: "Chat da equipe",             desc: "Acessa o chat interno geral",                               group: "Comunicação",   risk: "low" },
  { key: "chat.task",         label: "Chat por tarefa",            desc: "Pode comentar no chat de cada tarefa",                      group: "Comunicação",   risk: "low" },
  // Financeiro
  { key: "payments.manage",   label: "Gerenciar pagamentos",       desc: "Cria, edita e marca pagamentos como pagos",                 group: "Financeiro",    risk: "high" },
  { key: "payments.view_own", label: "Ver próprios pagamentos",    desc: "Vê apenas pagamentos onde é beneficiário",                  group: "Financeiro",    risk: "low" },
  { key: "reports.view_all",  label: "Relatório financeiro completo", desc: "Vê dados de todos os PJs e totais",                      group: "Financeiro",    risk: "high" },
  { key: "reports.export",    label: "Exportar / imprimir PDF",    desc: "Pode gerar o PDF do relatório",                             group: "Financeiro",    risk: "medium" },
  // Configurações
  { key: "automations.edit",  label: "Editar automações",          desc: "Cria e modifica automações do sistema",                     group: "Configurações", risk: "high" },
  { key: "members.manage",    label: "Gerenciar membros",          desc: "Altera papéis e tipo de contrato",                          group: "Configurações", risk: "high" },
  { key: "members.view",      label: "Ver membros da equipe",      desc: "Acessa a lista de membros",                                 group: "Configurações", risk: "low" },
  { key: "projects.manage",   label: "Gerenciar projetos",         desc: "Cria e edita projetos",                                     group: "Configurações", risk: "medium" },
];

const GROUPS = ["Tarefas", "Comunicação", "Financeiro", "Configurações"];

const RISK_COLOR: Record<string, string> = {
  low: "bg-emerald-50 text-emerald-700",
  medium: "bg-amber-50 text-amber-700",
  high: "bg-rose-50 text-rose-700",
};
const RISK_LABEL: Record<string, string> = { low: "Baixo risco", medium: "Atenção", high: "Crítico" };

// Presets
const PRESETS: Record<string, { label: string; desc: string; perms: Record<string, string[]> }> = {
  restrictive: {
    label: "Restritivo",
    desc: "Mínimo necessário para cada papel",
    perms: {
      manager: ["tasks.create","tasks.view_all","tasks.edit_own","tasks.approve","tasks.use_timer","tasks.use_templates","chat.access","chat.task","payments.manage","reports.view_all","reports.export","members.view","projects.manage"],
      member:  ["tasks.create","tasks.edit_own","tasks.use_timer","tasks.use_templates","chat.access","chat.task","members.view"],
      pj:      ["chat.task","payments.view_own"],
    },
  },
  standard: {
    label: "Padrão",
    desc: "Configuração recomendada",
    perms: {
      manager: ["tasks.create","tasks.view_all","tasks.edit_own","tasks.delete_any","tasks.approve","tasks.use_timer","tasks.use_templates","chat.access","chat.task","payments.manage","reports.view_all","reports.export","automations.edit","members.view","projects.manage"],
      member:  ["tasks.create","tasks.edit_own","tasks.use_timer","tasks.use_templates","chat.access","chat.task","members.view"],
      pj:      ["chat.task","payments.view_own"],
    },
  },
  open: {
    label: "Aberto",
    desc: "Mais liberdade para todos",
    perms: {
      manager: PERMISSIONS.filter(p => p.key !== "members.manage").map(p => p.key),
      member:  ["tasks.create","tasks.view_all","tasks.edit_own","tasks.use_timer","tasks.use_templates","chat.access","chat.task","members.view","projects.manage"],
      pj:      ["tasks.use_timer","chat.task","payments.view_own"],
    },
  },
};

const DEFAULT_ENABLED: Record<string, string[]> = PRESETS.standard.perms;

function PermissionsPage() {
  const { user, isAdmin } = useAuth();
  const [perms, setPerms] = useState<RolePerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableReady, setTableReady] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"table" | "cards">("table");
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<RolePerm[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("role_permissions" as never) as any)
        .select("*").order("role").order("permission");
      if (error) {
        setTableReady(false);
        const defaultPerms: RolePerm[] = [];
        for (const [role, keys] of Object.entries(DEFAULT_ENABLED)) {
          for (const p of PERMISSIONS) {
            defaultPerms.push({ id: `${role}:${p.key}`, role, permission: p.key, enabled: keys.includes(p.key) });
          }
        }
        // Admin always all
        for (const p of PERMISSIONS) {
          defaultPerms.push({ id: `admin:${p.key}`, role: "admin", permission: p.key, enabled: true });
        }
        setPerms(defaultPerms);
      } else {
        setTableReady(true);
        setPerms((data ?? []) as unknown as RolePerm[]);
        // History = items with updated_at
        setHistory(((data ?? []) as unknown as RolePerm[])
          .filter((p: RolePerm) => p.updated_at)
          .sort((a: RolePerm, b: RolePerm) => new Date(b.updated_at!).getTime() - new Date(a.updated_at!).getTime())
          .slice(0, 20));
      }
    } catch { setTableReady(false); }
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
    if (!tableReady) { toast.error("Execute a migration primeiro."); return; }
    const key = `${role}:${permission}`;
    setSaving(key);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("role_permissions" as never) as any)
        .upsert([{ role, permission, enabled: !currentEnabled, updated_at: new Date().toISOString(), updated_by: user?.id }], { onConflict: "role,permission" });
      if (error) { toast.error(error.message); setSaving(null); return; }
      setPerms((prev) => prev.map((p) =>
        p.role === role && p.permission === permission ? { ...p, enabled: !currentEnabled } : p
      ));
      toast.success(`${!currentEnabled ? "✓ Ativado" : "✗ Desativado"}: ${ROLES.find(r => r.key === role)?.label} → ${PERMISSIONS.find(p => p.key === permission)?.label}`);
    } catch (e) { toast.error(String(e)); }
    setSaving(null);
  };

  const applyPreset = async (presetKey: string) => {
    if (!tableReady) { toast.error("Execute a migration primeiro."); return; }
    const preset = PRESETS[presetKey];
    if (!confirm(`Aplicar preset "${preset.label}"? Isso vai sobrescrever as permissões atuais de Gestor, CLT e PJ.`)) return;

    const upserts: { role: string; permission: string; enabled: boolean; updated_at: string; updated_by: string | undefined }[] = [];
    for (const role of ["manager", "member", "pj"]) {
      for (const p of PERMISSIONS) {
        upserts.push({
          role, permission: p.key,
          enabled: (preset.perms[role] ?? []).includes(p.key),
          updated_at: new Date().toISOString(),
          updated_by: user?.id,
        });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("role_permissions" as never) as any)
      .upsert(upserts, { onConflict: "role,permission" });
    if (error) { toast.error(error.message); return; }
    toast.success(`Preset "${preset.label}" aplicado!`);
    void load();
  };

  const enabledFor = (role: string) => PERMISSIONS.filter(p => getPerm(role, p.key)?.enabled).length;

  return (
    <div className="space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" /> Painel de permissões
          </h1>
          <p className="text-sm text-muted-foreground">
            Configure o que cada papel pode fazer. Alterações são aplicadas em tempo real.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg border bg-background p-0.5">
            <button onClick={() => setActiveView("table")} className={cn("px-3 py-1.5 text-xs rounded-md font-medium transition-colors", activeView === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              Tabela
            </button>
            <button onClick={() => setActiveView("cards")} className={cn("px-3 py-1.5 text-xs rounded-md font-medium transition-colors", activeView === "cards" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              Por papel
            </button>
          </div>
        </div>
      </div>

      {/* Migration warning */}
      {!tableReady && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <div className="font-medium mb-1">Migration pendente — modo somente leitura</div>
            <p>Execute <code className="bg-amber-100 px-1 rounded">20260425400001_fix_permissions_and_panel.sql</code> no Supabase SQL Editor para ativar edição.</p>
          </div>
        </div>
      )}

      {/* Presets */}
      <div>
        <div className="text-sm font-medium mb-2 text-muted-foreground">Aplicar configuração pronta</div>
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(PRESETS).map(([key, preset]) => (
            <button key={key} onClick={() => applyPreset(key)} disabled={!tableReady}
              className="text-left rounded-xl border p-3 hover:border-primary/50 hover:bg-muted/20 transition-all disabled:opacity-50">
              <div className="font-medium text-sm">{preset.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{preset.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Role summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {ROLES.map((role) => {
          const active = role.key === "admin" ? PERMISSIONS.length : enabledFor(role.key);
          const total = PERMISSIONS.length;
          return (
            <Card key={role.key} className="overflow-hidden">
              <CardContent className="p-4">
                <Badge variant="outline" className={cn("text-xs mb-2", role.color)}>{role.label}</Badge>
                <div className="text-xs text-muted-foreground mb-1">{role.desc}</div>
                <div className="text-2xl font-bold mt-2">{active}<span className="text-sm font-normal text-muted-foreground">/{total}</span></div>
                <div className="text-xs text-muted-foreground">permissões ativas</div>
                <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.round((active/total)*100)}%` }} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Carregando...</div>
      ) : activeView === "table" ? (

        /* ── TABLE VIEW ── */
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-2 w-2 rounded-full bg-emerald-500" /> Baixo risco
            <div className="h-2 w-2 rounded-full bg-amber-500 ml-2" /> Atenção
            <div className="h-2 w-2 rounded-full bg-rose-500 ml-2" /> Crítico
            <span className="ml-2">· Permissões do Admin são fixas</span>
          </div>
          {GROUPS.map((group) => (
            <Card key={group}>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm">{group}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/20">
                        <th className="text-left p-3 font-medium text-muted-foreground w-[36%]">Permissão</th>
                        {ROLES.map((r) => (
                          <th key={r.key} className="p-3 text-center font-medium w-[16%]">
                            <Badge variant="outline" className={cn("text-xs font-medium", r.color)}>{r.label}</Badge>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {PERMISSIONS.filter((p) => p.group === group).map((perm) => (
                        <tr key={perm.key} className="border-b last:border-0 hover:bg-muted/10 transition-colors">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div className="font-medium text-sm">{perm.label}</div>
                              <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", RISK_COLOR[perm.risk])}>
                                {RISK_LABEL[perm.risk]}
                              </span>
                            </div>
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
          ))}
        </div>

      ) : (

        /* ── CARDS VIEW — por papel ── */
        <div className="grid sm:grid-cols-2 gap-4">
          {ROLES.map((role) => (
            <Card key={role.key}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Badge variant="outline" className={cn("text-sm font-semibold mb-1", role.color)}>{role.label}</Badge>
                    <div className="text-xs text-muted-foreground">{role.desc}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">{role.key === "admin" ? PERMISSIONS.length : enabledFor(role.key)}</div>
                    <div className="text-xs text-muted-foreground">de {PERMISSIONS.length}</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {GROUPS.map((group) => (
                  <div key={group}>
                    <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{group}</div>
                    <div className="space-y-1">
                      {PERMISSIONS.filter(p => p.group === group).map((perm) => {
                        const enabled = role.key === "admin" || (getPerm(role.key, perm.key)?.enabled ?? false);
                        return (
                          <div key={perm.key}
                            className={cn("flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors",
                              enabled ? "bg-emerald-50 text-emerald-800" : "bg-muted/30 text-muted-foreground"
                            )}>
                            {enabled
                              ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                              : <X className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                            }
                            <span className="flex-1">{perm.label}</span>
                            {role.key !== "admin" && tableReady && (
                              <button
                                onClick={() => toggle(role.key, perm.key, enabled)}
                                className="opacity-0 hover:opacity-100 group-hover:opacity-100 text-[10px] text-primary hover:underline"
                              >
                                {enabled ? "desativar" : "ativar"}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* History */}
      {tableReady && history.length > 0 && (
        <div>
          <button onClick={() => setShowHistory(h => !h)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            <History className="h-4 w-4" />
            Histórico de alterações ({history.length})
            {showHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {showHistory && (
            <Card className="mt-2">
              <CardContent className="p-0">
                <div className="divide-y max-h-64 overflow-y-auto">
                  {history.map((h) => {
                    const role = ROLES.find(r => r.key === h.role);
                    const perm = PERMISSIONS.find(p => p.key === h.permission);
                    return (
                      <div key={h.id} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                        {h.enabled
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                          : <X className="h-4 w-4 text-rose-500 shrink-0" />
                        }
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{role?.label ?? h.role}</span>
                          <span className="text-muted-foreground mx-1">→</span>
                          <span>{perm?.label ?? h.permission}</span>
                          <span className={cn("ml-2 font-medium", h.enabled ? "text-emerald-600" : "text-rose-600")}>
                            {h.enabled ? "ativado" : "desativado"}
                          </span>
                        </div>
                        <span className="text-muted-foreground shrink-0">{h.updated_at ? formatDateTime(h.updated_at) : ""}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
